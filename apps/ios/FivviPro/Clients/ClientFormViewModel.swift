import Foundation
import Observation
import FivviAPI

/// The form that adds a client (*+ Nieuwe klant*, a sheet) or edits one (the overview's *Bewerken*): name, email
/// address and language for emails, with the rules and messages of the web (F006 AC1 to AC3, AC7, AC12). The name and
/// the email address are required. The API decides in the end; the checks here only spare a request. Adding and editing need a connection:
/// a failed save keeps the input and says so (`information-architecture.md §9.5`).
@MainActor
@Observable
final class ClientFormViewModel {
    typealias Client = Components.Schemas.Client

    enum Mode: Equatable {
        case add
        /// Changes this client; only what differs from it is sent.
        case edit(Client)
    }

    enum NameError: Equatable {
        case required
        case tooLong
    }

    /// A client of the workspace already has the email address: the form offers to open that client instead.
    struct Existing: Equatable {
        let id: String
        let name: String
    }

    var name: String
    var email: String
    /// The language for the client's emails; nil follows the workspace's default (*Standaard (Nederlands)*).
    var locale: ClientLocale?
    private(set) var nameError: NameError?
    private(set) var emailInvalid = false
    private(set) var existing: Existing?
    /// The save failed (no connection, or an answer the form can't explain): nothing was saved, the input stays.
    private(set) var saveFailed = false
    /// The API says the person has no access to the clients (any more).
    private(set) var noPermission = false
    private(set) var isSaving = false
    private(set) var catalog: Catalog
    let mode: Mode
    let workspace: CurrentWorkspace
    private let api: any APIProtocol
    private let onForbidden: @MainActor (WorkspaceCapabilities.Capability) async -> Void

    init(
        api: any APIProtocol, workspace: CurrentWorkspace, catalog: Catalog, mode: Mode,
        onForbidden: @escaping @MainActor (WorkspaceCapabilities.Capability) async -> Void = { _ in }
    ) {
        self.api = api
        self.workspace = workspace
        self.catalog = catalog
        self.mode = mode
        self.onForbidden = onForbidden
        switch mode {
        case .add:
            name = ""
            email = ""
        case let .edit(client):
            name = client.name
            email = client.email
            locale = client.chosenLocale
        }
    }

    static let nameLimit = 120

    // MARK: Texts

    var nameErrorText: String? {
        switch nameError {
        case .required: catalog[.clientsNameRequired]
        case .tooLong: catalog[.clientsNameTooLong]
        case nil: nil
        }
    }

    var emailErrorText: String? { emailInvalid ? catalog[.clientsEmailInvalid] : nil }
    var existsText: String? { existing.map { catalog.string(.clientsExists, $0.name) } }
    var openExistingText: String? { existing.map { catalog.string(.clientsOpenExisting, $0.name) } }
    var saveFailedText: String? { saveFailed ? catalog[.clientsNotSaved] : nil }
    var noPermissionText: String { catalog.string(.noPermissionBody, workspace.name) }

    /// *Standaard (Nederlands)*: the choice that follows the workspace's default language, naming it.
    var defaultLocaleText: String {
        catalog.string(.clientsLocaleDefault, catalog.languageName(workspace.defaultLocale))
    }

    /// The interface language changed: the texts are in it at once.
    func use(_ catalog: Catalog) {
        self.catalog = catalog
    }

    // MARK: Saving

    /// Saves the client. Returns it when the API saved it; otherwise nil, with what went wrong in the form's state.
    func submit() async -> Client? {
        guard !isSaving else { return nil }
        resetMessages()
        let name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let email = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard validate(name: name, email: email) else { return nil }
        isSaving = true
        defer { isSaving = false }
        do {
            switch mode {
            case .add: return try await add(name: name, email: email)
            case let .edit(client): return try await update(client, name: name, email: email)
            }
        } catch {
            if ClientRequestError(thrown: error) != .cancelled { saveFailed = true }
            return nil
        }
    }

    /// *Ander e-mailadres*: drops the offer to open the existing client, so the address can be changed.
    func useAnotherEmail() {
        existing = nil
    }

    private func resetMessages() {
        nameError = nil
        emailInvalid = false
        existing = nil
        saveFailed = false
        noPermission = false
    }

    private func validate(name: String, email: String) -> Bool {
        if name.isEmpty {
            nameError = .required
        } else if name.count > Self.nameLimit {
            nameError = .tooLong
        }
        if email.range(of: #"^[^@\s]+@[^@\s]+\.[^@\s]+$"#, options: .regularExpression) == nil {
            emailInvalid = true
        }
        return nameError == nil && !emailInvalid
    }

    private func add(name: String, email: String) async throws -> Client? {
        let output = try await api.addClient(.init(
            path: .init(workspaceId: workspace.id),
            body: .json(.init(
                name: name, email: email,
                emailLocale: locale.flatMap { .init(rawValue: $0.rawValue) }, surface: .ios
            ))
        ))
        switch output {
        case let .created(created): return try created.body.json
        case let .badRequest(bad): showIssues(try bad.body.json.issues)
        case let .conflict(conflict): try await offerExisting(try conflict.body.json.clientId)
        case .forbidden: await forbid()
        case .notFound: noPermission = true
        default: saveFailed = true
        }
        return nil
    }

    private func update(_ client: Client, name: String, email: String) async throws -> Client? {
        let body = changes(of: client, name: name, email: email)
        if body == Components.Schemas.UpdateClientRequest() { return client }
        let output = try await api.updateClient(.init(
            path: .init(workspaceId: workspace.id, clientId: client.id), body: .json(body)
        ))
        switch output {
        case let .ok(saved): return try saved.body.json
        case let .badRequest(bad): showIssues(try bad.body.json.issues)
        case let .conflict(conflict): try await offerExisting(try conflict.body.json.clientId)
        case .forbidden: await forbid()
        case .notFound: noPermission = true
        default: saveFailed = true
        }
        return nil
    }

    /// The edit body: only what differs from `client`. A field left out, like a `nil`, means "keep"; the language is
    /// cleared with its own flag (the contract's `clearEmailLocale`). The address is never cleared: it is required.
    private func changes(of client: Client, name: String, email: String) -> Components.Schemas.UpdateClientRequest {
        var body = Components.Schemas.UpdateClientRequest()
        if name != client.name { body.name = name }
        if email.lowercased() != client.email { body.email = email }
        if locale != client.chosenLocale {
            if let locale { body.emailLocale = .init(rawValue: locale.rawValue) } else { body.clearEmailLocale = true }
        }
        return body
    }

    /// `400` names the invalid fields: the message goes to the field. An empty name is told from a long one by the
    /// text, as the API's `400` says only which field.
    private func showIssues(_ issues: [Components.Schemas.ValidationError.IssuesPayloadPayload]) {
        let paths = issues.map(\.path)
        if paths.contains(where: { $0.hasPrefix("name") }) {
            nameError = name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? .required : .tooLong
        }
        if paths.contains(where: { $0.hasPrefix("email") }) { emailInvalid = true }
        if nameError == nil, !emailInvalid { saveFailed = true }
    }

    /// `409`: the address belongs to a client of this workspace, whose ID the answer gives; the offer names them.
    private func offerExisting(_ id: String) async throws {
        let output = try await api.getClient(.init(path: .init(workspaceId: workspace.id, clientId: id)))
        guard case let .ok(found) = output else {
            saveFailed = true
            return
        }
        existing = Existing(id: id, name: try found.body.json.name)
    }

    private func forbid() async {
        noPermission = true
        await onForbidden(.clients_manage)
    }
}

import Foundation
import Observation
import FivviAPI

/// *Klantprofiel* / *Client profile* (TM-03): the overview of one client, name, email address and language for emails,
/// from `GET /api/v1/workspaces/{id}/clients/{clientId}` through the generated client, and its edit (F006 AC7, AC12).
/// The other parts of the profile come with the features that own them. What is shown stays when a later read fails.
@MainActor
@Observable
final class ClientProfileViewModel {
    typealias Client = Components.Schemas.Client

    enum State: Equatable {
        case loading
        case loaded
        case failed
        /// The API refused this client (the team access is gone, or the client is not in the workspace).
        case noPermission
    }

    private(set) var state: State
    private(set) var client: Client?
    /// The client has just been added: the overview says so.
    private(set) var justAdded: Bool
    /// The last edit was saved: the overview says so.
    private(set) var saved = false
    private(set) var catalog: Catalog
    let workspace: CurrentWorkspace
    private let api: any APIProtocol
    private let clientID: String
    private let onChange: @MainActor (Client) -> Void
    private let onForbidden: @MainActor (WorkspaceCapabilities.Capability) async -> Void

    /// A client whose data is at hand (from the list, or just added): it shows at once and is read again meanwhile.
    convenience init(
        api: any APIProtocol, workspace: CurrentWorkspace, client: Client, catalog: Catalog, justAdded: Bool = false,
        onChange: @escaping @MainActor (Client) -> Void = { _ in },
        onForbidden: @escaping @MainActor (WorkspaceCapabilities.Capability) async -> Void = { _ in }
    ) {
        self.init(
            api: api, workspace: workspace, clientID: client.id, catalog: catalog, onChange: onChange,
            onForbidden: onForbidden
        )
        self.client = client
        self.justAdded = justAdded
        state = .loaded
    }

    /// A client known by its ID only (*Anna de Vries openen* on a duplicate): the first read fills it.
    init(
        api: any APIProtocol, workspace: CurrentWorkspace, clientID: String, catalog: Catalog,
        onChange: @escaping @MainActor (Client) -> Void = { _ in },
        onForbidden: @escaping @MainActor (WorkspaceCapabilities.Capability) async -> Void = { _ in }
    ) {
        self.api = api
        self.workspace = workspace
        self.clientID = clientID
        self.catalog = catalog
        self.onChange = onChange
        self.onForbidden = onForbidden
        state = .loading
        justAdded = false
    }

    // MARK: Texts

    var title: String { client?.name ?? catalog[.clientProfileTitle] }
    var addedText: String? { justAdded ? client.map { catalog.string(.clientProfileAdded, $0.name) } : nil }
    var savedText: String? { saved ? catalog[.clientProfileSaved] : nil }
    var emailText: String { client?.email ?? catalog[.clientProfileNoEmail] }
    var localeText: String {
        client.map { catalog.emailLanguage(of: $0, workspaceDefault: workspace.defaultLocale) } ?? ""
    }
    var noPermissionText: String { catalog.string(.noPermissionBody, workspace.name) }

    // MARK: Reading and editing

    /// Reads the client with skeleton rows, and *Opnieuw proberen*.
    func load() async {
        state = .loading
        await read()
    }

    /// Reads the client again and leaves what is on screen until the answer is there; a failed answer is an error only
    /// when nothing was shown yet.
    func refresh() async {
        await read()
    }

    /// The form that edits this client (*Bewerken*), or nil while there is no client.
    func editForm() -> ClientFormViewModel? {
        guard let client else { return nil }
        return ClientFormViewModel(
            api: api, workspace: workspace, catalog: catalog, mode: .edit(client), onForbidden: onForbidden
        )
    }

    /// The edit was saved: the overview shows the answer, and the list its row.
    func didSave(_ client: Client) {
        self.client = client
        justAdded = false
        saved = true
        onChange(client)
    }

    /// The interface language changed: the texts are in it at once.
    func use(_ catalog: Catalog) {
        self.catalog = catalog
    }

    private func read() async {
        do {
            let output = try await api.getClient(.init(path: .init(workspaceId: workspace.id, clientId: clientID)))
            switch output {
            case let .ok(found):
                let fresh = try found.body.json
                if fresh != client { saved = false }
                client = fresh
                state = .loaded
                onChange(fresh)
            case .forbidden:
                await onForbidden(.clients_view)
                state = .noPermission
            case .notFound:
                state = .noPermission
            default:
                failed()
            }
        } catch {
            if ClientRequestError(thrown: error) != .cancelled { failed() }
        }
    }

    private func failed() {
        if state != .loaded { state = .failed }
    }
}

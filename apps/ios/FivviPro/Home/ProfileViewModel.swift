import Foundation
import Observation
import SwiftUI
import FivviAPI
import OpenAPIRuntime

/// *Profiel* (TM-04): the person's name (editable) and email address from `GET /api/v1/me` (F005), and the workspaces
/// they are on the team of, each with their role, from `GET /api/v1/me/workspaces` (F003 AC9), all through the generated
/// client. A workspace where the API lists `team.manage` for the person has the switch *I also train here* (F005 AC4,
/// AC5): `PUT` / `DELETE /api/v1/workspaces/{id}/trainer-profile`. The app holds no rule about who may see what or about
/// the name: the API's lists and refusals decide, and the role is only the label. No switching between workspaces yet
/// (F012).
@MainActor
@Observable
final class ProfileViewModel {
    /// How the last change of the switch of one workspace went.
    enum TrainsHereChange: Equatable {
        case idle, saving, saved, noConnection, failed
    }

    struct Entry: Equatable, Identifiable {
        let id: String
        let name: String
        /// The URL name: the test ids of the row end in it (the same on Android).
        let slug: String
        /// The role's label in the interface language ("Eigenaar", "Trainer"). A label only: nothing is decided on it.
        let role: String
        /// What the API says: always true for a Trainer, the Owner's own switch for an Owner.
        let trainsHere: Bool
        /// Whether the API lists `team.manage` for the person here (F004 AC10): only then the switch shows.
        let canSwitchTrainsHere: Bool
        let change: TrainsHereChange
    }

    enum State: Equatable {
        case loading
        case loaded([Entry])
        case failed
    }

    /// The person: `name` is nil until they have one.
    struct Account: Equatable {
        var name: String?
        var email: String
    }

    /// Why saving the name did not go through: the field message, or the line under it.
    enum NameError: Equatable {
        case required, tooLong, noConnection, generic
    }

    /// The sheet that changes the name: what is typed, whether it is being saved, and why the last save failed.
    struct NameEditor: Equatable {
        var input: String
        var saving = false
        var error: NameError?
    }

    private enum Outcome {
        case accepted, refused, noConnection, failed
    }

    private(set) var state = State.loading
    /// Nil until both reads have answered.
    private(set) var account: Account?
    /// True after a name was saved, until the next edit or the next opening.
    private(set) var nameSaved = false
    /// The name sheet while it is open. A foreground read leaves it, and what is typed in it, alone.
    private(set) var editor: NameEditor?
    private(set) var catalog: Catalog
    private let api: any APIProtocol
    /// Tells a screen reader about a line that appears (*Saved.*, a failure): the app posts an accessibility
    /// announcement, tests record the texts. The same as Android's polite live region.
    private let announce: @MainActor (String) -> Void
    /// What the API listed last, so the roles can be labelled again when the language changes.
    private var memberships: [Components.Schemas.MyWorkspace]?
    private var changes: [String: TrainsHereChange] = [:]
    /// Reads started so far, and the newest one whose answer is shown: an older answer arriving later is dropped.
    private var readsStarted = 0
    private var appliedRead = 0
    /// What the API accepted, kept over the answer of any read that started before it (that answer is older than the
    /// change); `after` is the number of reads started when it was accepted.
    private var switchOverrides: [String: (trainsHere: Bool, after: Int)] = [:]
    private var nameOverride: (name: String?, after: Int)?

    init(
        api: any APIProtocol, catalog: Catalog,
        announce: @escaping @MainActor (String) -> Void = { AccessibilityNotification.Announcement($0).post() }
    ) {
        self.api = api
        self.catalog = catalog
        self.announce = announce
    }

    /// A save is under way, of the name or of a switch: leaving Profiel would hide how it went, so back does nothing.
    var isSaving: Bool { editor?.saving == true || changes.values.contains(.saving) }

    /// The field message under the name, or the failure line, in the interface language.
    var nameMessage: String? {
        guard let error = editor?.error else { return nil }
        switch error {
        case .required: return catalog[.myProfileErrorsNameRequired]
        case .tooLong: return catalog[.myProfileErrorsNameTooLong]
        case .noConnection: return catalog[.myProfileErrorsNoConnection]
        case .generic: return catalog[.myProfileErrorsGeneric]
        }
    }

    /// Opening Profiel: reads with the loading state in view. A save still under way keeps its row.
    func load() async {
        state = .loading
        changes = changes.filter { $0.value == .saving }
        nameSaved = false
        await refresh()
    }

    /// Asks again on coming back to the app: what is shown stays until the answer is there; a failed answer is an error
    /// only when nothing was shown yet.
    func refresh() async {
        readsStarted += 1
        let started = readsStarted
        do {
            let account = try await api.getMe().ok.body.json
            let memberships = try await api.listMyWorkspaces().ok.body.json
            apply(account, memberships, started: started)
        } catch {
            // A read that was cancelled (the screen went, or was shown again) is not a verdict: its successor reads.
            if Task.isCancelled { return }
            if case .loaded = state { return }
            state = .failed
        }
    }

    private func apply(
        _ account: Components.Schemas.MeResponse, _ memberships: [Components.Schemas.MyWorkspace], started: Int
    ) {
        guard started > appliedRead else { return }
        appliedRead = started
        switchOverrides = switchOverrides.filter { $0.value.after >= started }
        if let override = nameOverride, override.after < started { nameOverride = nil }
        self.memberships = memberships
        self.account = Account(name: nameOverride.map(\.name) ?? account.name, email: account.email)
        relabel()
    }

    /// The interface language changed: the roles are labelled in it at once, without asking the API again.
    func use(_ catalog: Catalog) {
        self.catalog = catalog
        relabel()
    }

    private func relabel() {
        guard let memberships else { return }
        state = .loaded(memberships.map { workspace in
            .init(
                id: workspace.workspaceId, name: workspace.name, slug: workspace.slug, role: label(of: workspace.role),
                trainsHere: switchOverrides[workspace.workspaceId]?.trainsHere ?? workspace.trainsHere,
                canSwitchTrainsHere: workspace.capabilities.contains(.team_manage),
                change: changes[workspace.workspaceId] ?? .idle
            )
        })
    }

    private func label(of role: Components.Schemas.MyWorkspace.RolePayload) -> String {
        switch role {
        case .owner: catalog[.rolesOwner]
        case .trainer: catalog[.rolesTrainer]
        }
    }

    // MARK: The name (F005 AC1)

    /// The name row was tapped: the sheet opens with the name as it is.
    func startEditingName() {
        guard let account else { return }
        nameSaved = false
        editor = NameEditor(input: account.name ?? "")
    }

    /// Typing clears the message of the last refusal. Nothing is checked here: the API's rules are the only ones.
    func enterName(_ input: String) {
        guard var editor, !editor.saving else { return }
        editor.input = input
        editor.error = nil
        self.editor = editor
    }

    /// Leaves the sheet without saving; does nothing while a save is under way.
    func cancelEditingName() {
        guard editor?.saving != true else { return }
        editor = nil
    }

    /// `PATCH /api/v1/me` with the name as typed. The sheet closes once the API accepted; a refusal or a failure leaves
    /// it open with what was typed and says why.
    func saveName() async {
        guard var editor, !editor.saving else { return }
        editor.saving = true
        editor.error = nil
        self.editor = editor
        do {
            switch try await api.updateMe(body: .json(.init(name: editor.input))) {
            case let .ok(accepted):
                let saved = try accepted.body.json
                nameOverride = (saved.name, readsStarted)
                account = Account(name: saved.name, email: saved.email)
                nameSaved = true
                self.editor = nil
                announce(catalog[.myProfileSaved])
            case let .badRequest(refusal):
                failName(Self.nameError(of: try refusal.body.json))
            default:
                failName(.generic)
            }
        } catch {
            failName(Self.isConnection(error) ? .noConnection : .generic)
        }
    }

    private func failName(_ error: NameError) {
        editor?.saving = false
        editor?.error = error
        if let message = nameMessage { announce(message) }
    }

    /// `400 validation_failed` names the refused field: `too_small` is an empty or blank name, `too_big` a long one.
    private static func nameError(of refusal: Components.Schemas.ValidationError) -> NameError {
        switch refusal.issues.last(where: { $0.path == "name" })?.code {
        case "too_small": .required
        case "too_big": .tooLong
        default: .generic
        }
    }

    // MARK: The Owner's switch (F005 AC4, AC5)

    /// The Owner's switch: `trains` puts the trainer profile, off deletes it. The switch follows what the API accepted: until
    /// then it shows the old state, and a failed save leaves it so, with a message. A refusal (`403`, or `404` when the
    /// person lost their place) reads the lists again. Where the API does not list `team.manage` there is no switch, so
    /// nothing is sent for one.
    func setTrainsHere(_ trains: Bool, in workspaceID: String) async {
        guard case let .loaded(entries) = state,
              let entry = entries.first(where: { $0.id == workspaceID }),
              entry.canSwitchTrainsHere, entry.change != .saving
        else { return }
        changes[workspaceID] = .saving
        relabel()
        switch await send(trains, in: workspaceID) {
        case .accepted:
            switchOverrides[workspaceID] = (trains, readsStarted)
            changes[workspaceID] = .saved
            relabel()
            announce(catalog[.profileTrainsHereSaved])
        case .refused:
            changes[workspaceID] = .failed
            relabel()
            announce(catalog[.profileTrainsHereErrorsGeneric])
            await refresh()
        case .noConnection:
            changes[workspaceID] = .noConnection
            relabel()
            announce(catalog[.profileTrainsHereErrorsNoConnection])
        case .failed:
            changes[workspaceID] = .failed
            relabel()
            announce(catalog[.profileTrainsHereErrorsGeneric])
        }
    }

    private func send(_ trains: Bool, in workspaceID: String) async -> Outcome {
        do {
            if trains {
                switch try await api.putTrainerProfile(.init(path: .init(workspaceId: workspaceID))) {
                case .ok: return .accepted
                case .forbidden, .notFound: return .refused
                default: return .failed
                }
            }
            switch try await api.deleteTrainerProfile(.init(path: .init(workspaceId: workspaceID))) {
            case .noContent: return .accepted
            case .forbidden, .notFound: return .refused
            default: return .failed
            }
        } catch {
            return Self.isConnection(error) ? .noConnection : .failed
        }
    }

    /// A transport error (no network, a timeout) is "no connection"; anything else is a general failure.
    private static func isConnection(_ error: any Error) -> Bool {
        ((error as? ClientError)?.underlyingError ?? error) is URLError
    }
}

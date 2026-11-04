import Foundation
import Observation

/// The one place that knows the current workspace (F012, spec #423): every screen of a workspace (*Klanten* today;
/// Today and the calendar later) reads `current`, so a switch in *Profiel* reaches them all. It also keeps the ID of
/// the last workspace used on this phone, in `UserDefaults`, so the app opens it next time. The choice is per phone:
/// nothing about it goes to the server (AC10). A sign-out leaves it alone, so signing in again opens the same one.
@MainActor
@Observable
final class CurrentWorkspaceStore {
    nonisolated private static let key = "lastWorkspaceID"

    /// The workspace on screen, or nil while it is being read or when the person has none.
    private(set) var current: CurrentWorkspace?
    /// The last workspace used on this phone.
    private(set) var rememberedID: String?
    @ObservationIgnored private let save: (String) -> Void

    /// `save` is told the ID whenever the remembered one changes. A store with none keeps it in memory only, as the
    /// tests do.
    init(rememberedID: String? = nil, save: @escaping (String) -> Void = { _ in }) {
        self.rememberedID = rememberedID
        self.save = save
    }

    /// A store that keeps the last workspace in `defaults`.
    static func persistent(defaults: UserDefaults = .standard) -> CurrentWorkspaceStore {
        CurrentWorkspaceStore(
            rememberedID: defaults.string(forKey: key), save: { defaults.set($0, forKey: key) }
        )
    }

    /// Starts a test from a phone that remembers no workspace (`UITestSession`).
    nonisolated static func forget(defaults: UserDefaults = .standard) {
        defaults.removeObject(forKey: key)
    }

    /// The person chose this workspace: it is the one to open from now on.
    func remember(_ id: String) {
        guard rememberedID != id else { return }
        rememberedID = id
        save(id)
    }

    /// The home opened this workspace: it is the current one, and the last one used.
    func open(_ workspace: CurrentWorkspace) {
        current = workspace
        remember(workspace.id)
    }

    /// There is no current workspace: it is being read again, or the person is on no team.
    func close() {
        current = nil
    }
}

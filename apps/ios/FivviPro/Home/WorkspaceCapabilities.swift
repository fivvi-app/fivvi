import Foundation
import Observation
import FivviAPI

/// The one helper that answers "may I show this action here?" (F004 AC10, spec #172). It holds what the API lists per
/// workspace in `GET /api/v1/me`, the answer the home reads on opening and again on foreground, and nothing else in the
/// app decides whether an action shows: no screen tests the role name. The API refuses the rest with `403` anyway, so
/// this is only what is shown. `AccountViewModel` fills it.
@MainActor
@Observable
final class WorkspaceCapabilities {
    typealias Capability = Components.Schemas.MeWorkspace.CapabilitiesPayloadPayload

    private var byWorkspace: [String: Set<Capability>] = [:]
    /// With more than one workspace (F012) the last one used will decide; until then the workspace the home shows.
    private var currentWorkspaceID: String?
    /// Reads the capabilities again from the API; `AccountViewModel` sets it to its own refresh.
    @ObservationIgnored var reload: @MainActor () async -> Void = {}

    /// Whether the action guarded by `capability` shows in the current workspace. Nothing shows before the API has
    /// answered, or when the person has no workspace.
    func allows(_ capability: Capability) -> Bool {
        guard let currentWorkspaceID else { return false }
        return allows(capability, in: currentWorkspaceID)
    }

    /// Whether the action guarded by `capability` shows for the workspace `workspaceID`.
    func allows(_ capability: Capability, in workspaceID: String) -> Bool {
        byWorkspace[workspaceID]?.contains(capability) ?? false
    }

    /// The API answered `403` to an action guarded by `capability` in the current workspace: the action is hidden at
    /// once, then the capabilities are read again, and the list the API gives from then on decides.
    func forbidden(_ capability: Capability) async {
        if let currentWorkspaceID { byWorkspace[currentWorkspaceID]?.remove(capability) }
        await reload()
    }

    /// Takes what `GET /api/v1/me` listed; `current` is the workspace the home shows, if any.
    func replace(with workspaces: [Components.Schemas.MeWorkspace], current: String?) {
        byWorkspace = Dictionary(uniqueKeysWithValues: workspaces.map { ($0.id, Set($0.capabilities)) })
        currentWorkspaceID = current
    }
}

import Foundation
import Observation
import FivviAPI

/// *Profiel* (TM-04): the workspaces the person is on the team of, each with their role, from
/// `GET /api/v1/me/workspaces` through the generated client (F003 AC9). The app holds no rule about who may see what:
/// the API's list is the list. No switching between workspaces yet (F012).
@MainActor
@Observable
final class ProfileViewModel {
    struct Entry: Equatable, Identifiable {
        let id: String
        let name: String
        /// The URL name: the test ids of the row end in it (the same on Android).
        let slug: String
        /// The role's label in the interface language ("Eigenaar", "Trainer").
        let role: String
    }

    enum State: Equatable {
        case loading
        case loaded([Entry])
        case failed
    }

    private(set) var state = State.loading
    private(set) var catalog: Catalog
    private let api: any APIProtocol
    /// What the API listed last, so the roles can be labelled again when the language changes.
    private var memberships: [Components.Schemas.MyWorkspace]?

    init(api: any APIProtocol, catalog: Catalog) {
        self.api = api
        self.catalog = catalog
    }

    func load() async {
        state = .loading
        await refresh()
    }

    /// Asks again on coming back to the app: what is shown stays until the answer is there; a failed answer is an error
    /// only when nothing was shown yet.
    func refresh() async {
        do {
            memberships = try await api.listMyWorkspaces().ok.body.json
            relabel()
        } catch {
            if case .loaded = state { return }
            state = .failed
        }
    }

    /// The interface language changed: the roles are labelled in it at once, without asking the API again.
    func use(_ catalog: Catalog) {
        self.catalog = catalog
        relabel()
    }

    private func relabel() {
        guard let memberships else { return }
        state = .loaded(memberships.map {
            .init(id: $0.workspaceId, name: $0.name, slug: $0.slug, role: label(of: $0.role))
        })
    }

    private func label(of role: Components.Schemas.MyWorkspace.RolePayload) -> String {
        switch role {
        case .owner: catalog[.rolesOwner]
        case .trainer: catalog[.rolesTrainer]
        }
    }
}

import FivviAPI

extension StubAPI {
    /// The account `getMe` answers with: a workspace of each name in `workspaces` (synthetic IDs and slugs, the
    /// account an owner of each), or the `team` when a test gives one.
    static func me(
        id: String, email: String, workspaces: [String] = [], canCreateWorkspace: Bool = false,
        preferredLocale: Components.Schemas.Locale? = nil, team: [Membership] = [], name: String? = "Owner"
    ) -> Components.Schemas.MeResponse {
        .init(
            id: id, email: email, name: name,
            preferredLocale: preferredLocale.flatMap { .init(rawValue: $0.rawValue) },
            bookingEmails: true,
            canCreateWorkspace: canCreateWorkspace,
            workspaces: team.isEmpty
                ? workspaces.enumerated().map { index, name in
                    .init(
                        id: "7c1d2e3f-0000-4000-8000-00000000000\(index)", name: name,
                        slug: "workspace-\(index)", trainerWord: .trainer, role: .owner,
                        capabilities: Components.Schemas.MeWorkspace.CapabilitiesPayloadPayload.allCases
                    )
                }
                : team.map {
                    .init(
                        id: $0.workspaceID, name: $0.name, slug: $0.slug, trainerWord: .trainer,
                        role: Self.meRole($0.role),
                        capabilities: ($0.capabilities ?? Self.capabilities(of: $0.role)).compactMap {
                            .init(rawValue: $0.rawValue)
                        }
                    )
                },
            clientWorkspaces: []
        )
    }

    /// The role `GET /api/v1/me` lists; one it has no value for is a broken fixture, so it stops.
    private static func meRole(
        _ role: Components.Schemas.MyWorkspace.RolePayload
    ) -> Components.Schemas.MeWorkspace.RolePayload {
        typealias MeRole = Components.Schemas.MeWorkspace.RolePayload
        guard let mapped = MeRole(rawValue: role.rawValue) else { preconditionFailure("no me role \(role)") }
        return mapped
    }

    /// The permission matrix of `packages/domain` (F004): the Owner may do everything, the Trainer the clients.
    static func capabilities(
        of role: Components.Schemas.MyWorkspace.RolePayload
    ) -> [Components.Schemas.MyWorkspace.CapabilitiesPayloadPayload] {
        typealias Capability = Components.Schemas.MyWorkspace.CapabilitiesPayloadPayload
        return role == .owner ? Capability.allCases : [.trainers_view, .clients_view, .clients_manage]
    }
}

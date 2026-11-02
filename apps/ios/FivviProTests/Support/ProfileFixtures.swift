import FivviAPI

@testable import FivviPro

/// Sarah (synthetic): Trainer of John's Gym, Owner of Sarah Personal Training; what `Profiel` tests share.
enum ProfileFixtures {
    static let johns = "7c1d2e3f-0000-4000-8000-000000000001"
    static let own = "7c1d2e3f-0000-4000-8000-000000000002"

    static func sarah(ownerTrainsHere: Bool = true) -> [StubAPI.Membership] {
        [
            .init(workspaceID: johns, name: "John's Gym", slug: "johns-gym", role: .trainer),
            .init(
                workspaceID: own, name: "Sarah Personal Training", slug: "sarah-personal-training", role: .owner,
                trainsHere: ownerTrainsHere
            )
        ]
    }

    /// A model for Sarah, loaded: the account `sarah@example.com` named "Sarah" and her two workspaces.
    @MainActor
    static func loadedModel(
        _ api: StubAPI, ownerTrainsHere: Bool = true, name: String? = "Sarah",
        announcements: Announcements = Announcements()
    ) async -> ProfileViewModel {
        await api.answerMe(with: .account(email: "sarah@example.com", name: name))
        await api.answerMyWorkspaces(with: .workspaces(sarah(ownerTrainsHere: ownerTrainsHere)))
        let model = ProfileViewModel(
            api: api, catalog: Catalog(locale: InterfaceLanguage.resolve(.system())),
            announce: { announcements.record($0) }
        )
        await model.load()
        return model
    }
}

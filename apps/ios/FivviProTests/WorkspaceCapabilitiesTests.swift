import FivviAPI
import XCTest

@testable import FivviPro

/// The one helper that answers "may I show this action here?" (F004, spec #172): from the capabilities the API lists
/// per workspace in `GET /api/v1/me`, never from the role name. The test plan runs every test in nl and en
/// (FivviPro.xctestplan).
@MainActor
final class WorkspaceCapabilitiesTests: XCTestCase {
    private let language = InterfaceLanguage.resolve(.system())
    private let johnsGym = "7c1d2e3f-0000-4000-8000-000000000001"
    private let sarahTraining = "7c1d2e3f-0000-4000-8000-000000000002"

    private var sarahMembership: StubAPI.Membership {
        .init(
            workspaceID: sarahTraining, name: "Sarah Personal Training", slug: "sarah-personal-training", role: .owner
        )
    }

    /// John's Gym with Sarah as Trainer, the API listing only `capabilities`.
    private func johns(
        _ capabilities: [Components.Schemas.MyWorkspace.CapabilitiesPayloadPayload]? = nil
    ) -> StubAPI.Membership {
        .init(
            workspaceID: johnsGym, name: "John's Gym", slug: "johns-gym", role: .trainer, capabilities: capabilities
        )
    }

    private func account(_ api: StubAPI) -> AccountViewModel {
        AccountViewModel(
            api: api, store: InMemorySessionStore(token: "stored-token"), onAccount: { _ in }, onSignedOut: { _ in }
        )
    }

    /// Sarah (synthetic): Trainer of John's Gym, Owner of Sarah Personal Training.
    private func answerAsSarah(_ api: StubAPI) async {
        await api.answerMe(with: .account(email: "trainer@example.com", team: [
            johns(),
            sarahMembership
        ]))
    }

    func test_F004_AC10_newClientActionFollowsCapability() async {
        XCTAssertEqual(language, TestCatalog.configuredLocale, "the test plan's language reaches the app")
        let api = StubAPI()
        let account = account(api)
        let capabilities = account.capabilities
        XCTAssertFalse(capabilities.allows(.clients_manage), "nothing is shown before the API has answered")

        await api.answerMe(with: .account(email: "trainer@example.com", team: [
            johns([.clients_manage])
        ]))
        await account.load()
        XCTAssertTrue(capabilities.allows(.clients_manage), "listed: shown")

        await api.answerMe(with: .account(email: "trainer@example.com", team: [
            johns([.clients_view])
        ]))
        await account.refresh()
        XCTAssertFalse(capabilities.allows(.clients_manage), "not listed: not shown")
        XCTAssertTrue(capabilities.allows(.clients_view))
    }

    func test_F004_AC10_theRoleNameDecidesNothing() async {
        let api = StubAPI()
        let account = account(api)
        // An owner whose list lacks the capability: the list is the answer.
        await api.answerMe(with: .account(email: "owner@example.com", team: [
            .init(workspaceID: johnsGym, name: "John's Gym", slug: "johns-gym", role: .owner, capabilities: [])
        ]))

        await account.load()

        XCTAssertFalse(account.capabilities.allows(.clients_manage))
    }

    func test_F004_AC8_roleLabelsPerWorkspace() async {
        let api = StubAPI()
        await answerAsSarah(api)
        let account = account(api)
        await account.load()
        await api.answerMyWorkspaces(with: .workspaces([
            johns(),
            sarahMembership
        ]))
        let profile = ProfileViewModel(api: api, catalog: Catalog(locale: language))

        await profile.load()

        let catalog = TestCatalog(language)
        guard case let .loaded(entries) = profile.state else { return XCTFail("\(profile.state)") }
        XCTAssertEqual(entries.map(\.name), ["John's Gym", "Sarah Personal Training"])
        XCTAssertEqual(entries.map(\.role), [catalog["roles.trainer"], catalog["roles.owner"]])
        let capabilities = account.capabilities
        XCTAssertFalse(capabilities.allows(.workspace_manage, in: johnsGym), "Trainer in John's Gym")
        XCTAssertTrue(capabilities.allows(.clients_manage, in: johnsGym))
        XCTAssertTrue(capabilities.allows(.workspace_manage, in: sarahTraining), "Owner in her own workspace")
        XCTAssertTrue(capabilities.allows(.team_manage, in: sarahTraining))
        let unknown = "7c1d2e3f-0000-4000-8000-000000000009"
        XCTAssertFalse(capabilities.allows(.clients_manage, in: unknown), "unknown workspace")
    }

    func test_F004_AC10_theCurrentWorkspaceIsTheOneTheHomeShows() async {
        let api = StubAPI()
        await answerAsSarah(api)
        let account = account(api)

        await account.load()

        XCTAssertEqual(account.destination, .workspace(name: "John's Gym"))
        XCTAssertFalse(account.capabilities.allows(.team_manage), "John's Gym: Trainer")
        await api.removeFromTeam(of: johnsGym)
        await account.refresh()
        XCTAssertEqual(account.destination, .workspace(name: "Sarah Personal Training"))
        XCTAssertTrue(account.capabilities.allows(.team_manage), "the next workspace is the current one")
    }

    func test_F004_AC10_aFailedRefreshKeepsTheCachedCapabilities() async {
        let api = StubAPI()
        await answerAsSarah(api)
        let account = account(api)
        await account.load()

        await api.answerMe(with: .offline)
        await account.refresh()

        XCTAssertTrue(account.capabilities.allows(.clients_manage))
    }

    func test_F004_AC10_noWorkspaceShowsNoAction() async {
        let api = StubAPI()
        await api.answerMe(with: .account(email: "newcomer@example.com", canCreateWorkspace: true))
        let account = account(api)

        await account.load()

        XCTAssertFalse(account.capabilities.allows(.clients_manage))
    }

    func test_F004_AC10_aWorkspaceListedTwiceDoesNotCrashAndTheLaterEntryDecides() async {
        let api = StubAPI()
        await api.answerMe(with: .account(email: "trainer@example.com", team: [
            johns([.clients_manage]),
            johns([.clients_view])
        ]))
        let account = account(api)

        await account.load()

        XCTAssertFalse(account.capabilities.allows(.clients_manage, in: johnsGym))
        XCTAssertTrue(account.capabilities.allows(.clients_view, in: johnsGym))
    }

    func test_F004_AC10_aForbiddenAnswerRefreshesTheCapabilitiesAndHidesTheAction() async {
        let api = StubAPI()
        await answerAsSarah(api)
        let account = account(api)
        await account.load()
        XCTAssertTrue(account.capabilities.allows(.clients_manage))
        let before = await api.meCalls

        // The API took the capability away (403 on the action): the next /me lists it without.
        await api.answerMe(with: .account(email: "trainer@example.com", team: [
            johns([.clients_view])
        ]))
        await account.capabilities.forbidden(.clients_manage)

        let after = await api.meCalls
        XCTAssertEqual(after, before + 1, "the capabilities were asked again")
        XCTAssertFalse(account.capabilities.allows(.clients_manage))
    }

    func test_F004_AC10_aForbiddenAnswerHidesTheActionEvenWhenTheRefreshFails() async {
        let api = StubAPI()
        await answerAsSarah(api)
        let account = account(api)
        await account.load()

        await api.answerMe(with: .offline)
        await account.capabilities.forbidden(.clients_manage)

        XCTAssertFalse(account.capabilities.allows(.clients_manage), "the 403 is the answer until the list is read")
        XCTAssertTrue(account.capabilities.allows(.clients_view), "only the refused capability is hidden")
    }
}

import FivviAPI
import XCTest

@testable import FivviPro

/// Switching workspace and reopening the last one (F012, spec #423), in nl and en (the test plan runs every test in
/// both): the current workspace is one store every screen reads, the last one is kept on this phone, and what the home
/// offers follows the capabilities of the workspace on screen.
@MainActor
final class WorkspaceSwitchTests: XCTestCase {
    private let johnsGym = ProfileFixtures.johns
    private let sarahTraining = ProfileFixtures.own

    private func account(
        _ api: StubAPI, defaults: UserDefaults, store: InMemorySessionStore = InMemorySessionStore(token: "t")
    ) -> AccountViewModel {
        AccountViewModel(
            api: api, store: store, onAccount: { _ in }, onSignedOut: { _ in },
            workspaces: .persistent(defaults: defaults)
        )
    }

    private func answerAsSarah(_ api: StubAPI) async {
        await api.answerMe(with: .account(email: "trainer@example.com", team: ProfileFixtures.sarah()))
    }

    func test_F012_AC6_switchingMakesTheOtherWorkspaceTheCurrentOne() async throws {
        let api = StubAPI()
        await answerAsSarah(api)
        let model = account(api, defaults: try emptyDefaults())
        await model.load()
        XCTAssertEqual(model.workspace?.id, johnsGym, "the first by name when nothing is remembered")

        await model.switchWorkspace(to: sarahTraining)

        XCTAssertEqual(model.workspace?.id, sarahTraining)
        XCTAssertEqual(model.workspace?.name, "Sarah Personal Training")
        XCTAssertEqual(model.destination, .workspace(name: "Sarah Personal Training"))
        XCTAssertEqual(model.state, .loaded(email: "trainer@example.com"))
    }

    func test_F012_AC6_aWorkspaceThePersonIsNotOnIsNotSwitchedTo() async throws {
        let api = StubAPI()
        await answerAsSarah(api)
        let model = account(api, defaults: try emptyDefaults())
        await model.load()

        await model.switchWorkspace(to: "7c1d2e3f-0000-4000-8000-000000000009")

        XCTAssertEqual(model.workspace?.id, johnsGym, "the list from the API decides")
    }

    func test_F012_AC7_appOpensLastWorkspace() async throws {
        let defaults = try emptyDefaults()
        let api = StubAPI()
        await answerAsSarah(api)
        let model = account(api, defaults: defaults)
        await model.load()
        await model.switchWorkspace(to: sarahTraining)

        // The app was closed and opened again: a new model on the same phone.
        let reopened = account(api, defaults: defaults)
        await reopened.load()

        XCTAssertEqual(reopened.workspace?.id, sarahTraining)
        XCTAssertEqual(reopened.destination, .workspace(name: "Sarah Personal Training"))
        XCTAssertFalse(reopened.capabilities.allows(.workspace_manage, in: johnsGym))
    }

    func test_F012_AC7_theLastWorkspaceSurvivesASignOutAndSignIn() async throws {
        let defaults = try emptyDefaults()
        let api = StubAPI()
        await answerAsSarah(api)
        let store = InMemorySessionStore(token: "t")
        let model = account(api, defaults: defaults, store: store)
        await model.load()
        await model.switchWorkspace(to: sarahTraining)

        await model.signOut()
        XCTAssertNil(store.token)
        try store.save(token: "new-token")
        let signedInAgain = account(api, defaults: defaults, store: store)
        await signedInAgain.load()

        XCTAssertEqual(signedInAgain.workspace?.id, sarahTraining)
    }

    func test_F012_AC7_aRefreshKeepsTheWorkspaceTheCurrentOne() async throws {
        let api = StubAPI()
        await answerAsSarah(api)
        let model = account(api, defaults: try emptyDefaults())
        await model.load()
        await model.switchWorkspace(to: sarahTraining)

        await model.refresh()

        XCTAssertEqual(model.workspace?.id, sarahTraining, "coming back to the app does not go back to the first")
    }

    func test_F012_AC5_aRememberedWorkspaceTheTeamAccessIsGoneFromFallsBack() async throws {
        let defaults = try emptyDefaults()
        let api = StubAPI()
        await answerAsSarah(api)
        let first = account(api, defaults: defaults)
        await first.load()
        await first.switchWorkspace(to: sarahTraining)

        // Sarah was removed from Sarah Personal Training: the list no longer has it.
        await api.answerMe(with: .account(email: "trainer@example.com", team: [ProfileFixtures.sarah()[0]]))
        let reopened = account(api, defaults: defaults)
        await reopened.load()

        XCTAssertEqual(reopened.workspace?.id, johnsGym)
        XCTAssertEqual(reopened.destination, .workspace(name: "John's Gym"))
        XCTAssertEqual(reopened.state, .loaded(email: "trainer@example.com"), "no error")
    }

    func test_F012_AC5_aRememberedWorkspaceThatAnswers404FallsBackWithoutAnError() async throws {
        let defaults = try emptyDefaults()
        let api = StubAPI()
        await answerAsSarah(api)
        let first = account(api, defaults: defaults)
        await first.load()
        await first.switchWorkspace(to: sarahTraining)
        await api.removeFromTeam(of: sarahTraining)

        let reopened = account(api, defaults: defaults)
        await reopened.load()

        XCTAssertEqual(reopened.workspace?.id, johnsGym)
        XCTAssertEqual(reopened.state, .loaded(email: "trainer@example.com"))
    }

    func test_F012_AC5_withNoWorkspaceLeftTheNoAccessStateShows() async throws {
        let defaults = try emptyDefaults()
        let api = StubAPI()
        await answerAsSarah(api)
        let first = account(api, defaults: defaults)
        await first.load()
        await first.switchWorkspace(to: sarahTraining)
        await api.answerMe(with: .account(email: "trainer@example.com"))

        let reopened = account(api, defaults: defaults)
        await reopened.load()

        XCTAssertEqual(reopened.destination, .noAccess)
        XCTAssertNil(reopened.workspace)
    }

    func test_F012_AC10_switchingStoresNothingOnTheServer() async throws {
        let api = StubAPI()
        await answerAsSarah(api)
        let model = account(api, defaults: try emptyDefaults())
        await model.load()

        await model.switchWorkspace(to: sarahTraining)

        let locales = await api.savedLocales
        let names = await api.savedNames
        XCTAssertTrue(locales.isEmpty, "the language is personal and stays as it is (ADR-017)")
        XCTAssertTrue(names.isEmpty, "nothing about the current workspace is sent to the server")
    }

    func test_F012_AC11_actionsFollowWorkspaceRole() async throws {
        let api = StubAPI()
        await answerAsSarah(api)
        let model = account(api, defaults: try emptyDefaults())

        await model.load()
        XCTAssertEqual(model.workspace?.id, johnsGym)
        XCTAssertTrue(model.capabilities.allows(.clients_manage), "a Trainer manages clients")
        XCTAssertFalse(model.capabilities.allows(.team_manage), "no Owner-only action in John's Gym")
        XCTAssertFalse(model.capabilities.allows(.workspace_manage))

        await model.switchWorkspace(to: sarahTraining)
        XCTAssertTrue(model.capabilities.allows(.team_manage), "Owner of her own workspace")
        XCTAssertTrue(model.capabilities.allows(.workspace_manage))

        await model.switchWorkspace(to: johnsGym)
        XCTAssertFalse(model.capabilities.allows(.team_manage), "back in John's Gym the Owner-only actions are gone")
    }

    func test_F012_AC6_theStoreForgetsTheLastWorkspaceForATest() throws {
        let defaults = try emptyDefaults()
        let store = CurrentWorkspaceStore.persistent(defaults: defaults)
        store.remember(sarahTraining)
        XCTAssertEqual(CurrentWorkspaceStore.persistent(defaults: defaults).rememberedID, sarahTraining)

        CurrentWorkspaceStore.forget(defaults: defaults)

        XCTAssertNil(CurrentWorkspaceStore.persistent(defaults: defaults).rememberedID)
    }
}

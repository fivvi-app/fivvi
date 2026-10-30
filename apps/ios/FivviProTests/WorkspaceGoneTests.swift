import FivviAPI
import XCTest

@testable import FivviPro

/// Lost team access takes effect in the app (F003 AC6): the API answers `404` for the workspace the home shows, and
/// the home switches to the no-access text, or to the person's other workspace, without signing out.
@MainActor
final class WorkspaceGoneTests: XCTestCase {
    private func model(
        _ api: StubAPI, store: InMemorySessionStore = InMemorySessionStore(token: "stored-token")
    ) -> AccountViewModel {
        AccountViewModel(api: api, store: store, onAccount: { _ in }, onSignedOut: { _ in })
    }

    private let firstID = "7c1d2e3f-0000-4000-8000-000000000000"
    private let secondID = "7c1d2e3f-0000-4000-8000-000000000001"

    func test_F003_AC6_workspaceGoneShowsNoAccess() async {
        let api = StubAPI()
        await api.answerMe(with: .account(email: "trainer@example.com", workspaces: ["John's Gym"]))
        await api.removeFromTeam(of: firstID)
        let store = InMemorySessionStore(token: "stored-token")
        let model = model(api, store: store)

        await model.load()

        XCTAssertEqual(model.destination, .noAccess)
        XCTAssertEqual(model.state, .loaded(email: "trainer@example.com"), "the account is still shown")
        XCTAssertEqual(store.token, "stored-token", "no sign-out")
        let requested = await api.requestedWorkspaces
        XCTAssertEqual(requested, [firstID], "the workspace on screen was asked for")
    }

    func test_F003_AC6_workspaceGoneShowsTheOtherWorkspace() async {
        let api = StubAPI()
        await api.answerMe(with: .account(
            email: "trainer@example.com", workspaces: ["John's Gym", "Sarah Personal Training"]
        ))
        await api.removeFromTeam(of: firstID)
        let model = model(api)

        await model.load()

        XCTAssertEqual(model.destination, .workspace(name: "Sarah Personal Training"))
        let requested = await api.requestedWorkspaces
        XCTAssertEqual(requested, [firstID, secondID])
    }

    func test_F003_AC6_aWorkspaceThatLaterGoesIsNoticedOnTheNextRefresh() async {
        let api = StubAPI()
        await api.answerMe(with: .account(email: "trainer@example.com", workspaces: ["John's Gym"]))
        let model = model(api)
        await model.load()
        XCTAssertEqual(model.destination, .workspace(name: "John's Gym"))

        await api.removeFromTeam(of: firstID)
        await model.refresh()

        XCTAssertEqual(model.destination, .noAccess)
    }

    func test_F003_AC6_aRefreshKeepsTheHomeOnScreenAndAFailedOneChangesNothing() async {
        let api = StubAPI()
        await api.answerMe(with: .account(email: "trainer@example.com", workspaces: ["John's Gym"]))
        let model = model(api)
        await model.load()

        await api.answerMe(with: .offline)
        await model.refresh()

        XCTAssertEqual(model.destination, .workspace(name: "John's Gym"))
        XCTAssertEqual(model.state, .loaded(email: "trainer@example.com"))
    }

    func test_F003_AC6_anotherErrorForTheWorkspaceIsAFailureNotLostAccess() async {
        let api = StubAPI()
        await api.answerMe(with: .account(email: "trainer@example.com", workspaces: ["John's Gym"]))
        await api.answerWorkspace(withStatus: 503)
        let model = model(api)

        await model.load()

        XCTAssertEqual(model.state, .failed)
        XCTAssertNil(model.destination)
    }
}

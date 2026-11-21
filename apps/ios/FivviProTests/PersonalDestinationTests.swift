import FivviAPI
import XCTest

@testable import FivviPro
@testable import FivviStrings
@testable import FivviLanguage

/// The screen a row of Vandaag opens (F013 AC4): the item's workspace is read first. When it can't be read the screen says
/// why, in the words that fit, and *Opnieuw* reads it again. The test plan runs every test in nl and en.
@MainActor
final class PersonalDestinationTests: XCTestCase {
    private let language = InterfaceLanguage.resolve(.system())
    private var catalog: TestCatalog { TestCatalog(language) }

    private func account(_ api: StubAPI, loaded: Bool = true) async throws -> AccountViewModel {
        await api.answerMe(with: .account(email: "trainer@example.com", team: ProfileFixtures.sarah()))
        let model = AccountViewModel(
            api: api, store: InMemorySessionStore(token: "t"), onAccount: { _ in }, onSignedOut: { _ in },
            workspaces: .persistent(defaults: try emptyDefaults())
        )
        if loaded { await model.load() }
        return model
    }

    private func destination(_ account: AccountViewModel) -> PersonalDestinationModel {
        PersonalDestinationModel(route: .session(workspaceID: ProfileFixtures.own, id: "anna"), account: account)
    }

    func test_F013_AC4_theItemsWorkspaceIsReadBeforeTheScreenOpens() async throws {
        let model = destination(try await account(StubAPI()))
        XCTAssertEqual(model.state, .loading)

        await model.load()

        guard case let .ready(workspace) = model.state else { return XCTFail("not ready: \(model.state)") }
        XCTAssertEqual(workspace.id, ProfileFixtures.own)
        XCTAssertNil(model.message(Catalog(locale: language)))
    }

    func test_F013_AC4_withoutAConnectionTheScreenSaysSoAndOpnieuwReadsItAgain() async throws {
        let api = StubAPI()
        let model = destination(try await account(api))
        await api.answerWorkspaceOffline()

        await model.load()

        XCTAssertEqual(model.state, .offline)
        XCTAssertEqual(model.message(Catalog(locale: language)), catalog["common.offline"])

        await api.answerWorkspaceOffline(false)
        await model.load(retry: true)

        guard case .ready = model.state else { return XCTFail("not ready: \(model.state)") }
    }

    func test_F013_AC4_aWorkspaceThatCantBeReadIsNotTheTextOfVandaagFailing() async throws {
        let api = StubAPI()
        let model = destination(try await account(api))
        await api.answerWorkspace(withStatus: 500)

        await model.load()

        XCTAssertEqual(model.state, .unavailable)
        let message = model.message(Catalog(locale: language))
        XCTAssertEqual(message, catalog["sessions.form.loadFailed"])
        XCTAssertNotEqual(message, catalog["myDay.app.failed"])
    }

    func test_F013_AC4_opnieuwAsksTheAccountAgainWhenItsWorkspacesWereNotLoaded() async throws {
        let api = StubAPI()
        let model = destination(try await account(api, loaded: false))
        await model.load()
        XCTAssertEqual(model.state, .unavailable, "no workspaces are known yet")

        await model.load(retry: true)

        guard case .ready = model.state else { return XCTFail("not ready: \(model.state)") }
    }
}

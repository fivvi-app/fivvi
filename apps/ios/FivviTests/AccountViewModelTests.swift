import FivviAPI
import FivviLanguage
import FivviSession
import XCTest

@testable import Fivvi

/// The account the tabs of Fivvi show: `GET /api/v1/me` through the real generated client (E017 AC1, AC2, AC3).
@MainActor
final class AccountViewModelTests: XCTestCase {
    private final class Told: @unchecked Sendable {
        private(set) var rejections: [Bool] = []
        private(set) var accounts: [String] = []
        private(set) var locales: [Components.Schemas.Locale?] = []
        func signedOut(afterRejection: Bool) { rejections.append(afterRejection) }
        func account(_ id: String) { accounts.append(id) }
        func locale(_ locale: Components.Schemas.Locale?) { locales.append(locale) }
    }

    private let told = Told()

    private func model(
        _ transport: any ClientTransport, store: InMemorySessionStore = InMemorySessionStore(token: Accounts.token),
        signOutTimeout: Duration = .seconds(10)
    ) -> AccountViewModel {
        AccountViewModel(
            api: Accounts.client(transport, store: store), store: store, signOutTimeout: signOutTimeout,
            onAccount: { [told] in told.account($0) },
            onSignedOut: { [told] in told.signedOut(afterRejection: $0) },
            onPreferredLocale: { [told] in { told.locale($0) } }
        )
    }

    // MARK: AC1 and AC3: what the account says

    func test_E017_AC1_anAccountWithoutAWorkspaceHasNoTeamRole() async {
        let model = model(StubTransport(json: Accounts.anna()))

        await model.load()

        XCTAssertEqual(model.state, .loaded(name: "Anna de Vries", email: "anna@example.com", hasTeamRole: false))
    }

    func test_E017_AC3_aTrainerHasATeamRoleAndTheStateHoldsNoTeamData() async {
        let model = model(StubTransport(json: Accounts.sarah()))

        await model.load()

        XCTAssertEqual(model.state, .loaded(name: "Sarah", email: "trainer@example.com", hasTeamRole: true))
        XCTAssertFalse(String(describing: model.state).contains("John's Gym"), "no workspace name in what the app holds")
    }

    func test_E017_AC1_theAccountsIdIsToldForErrorReporting() async {
        let model = model(StubTransport(json: Accounts.anna()))

        await model.load()

        XCTAssertEqual(told.accounts, [Accounts.id])
    }

    func test_E017_AC1_anAnswerThatArrivesAfterTheSignOutSetsNoUser() async {
        let store = InMemorySessionStore(token: Accounts.token)
        let transport = StubTransport(json: Accounts.anna())
        transport.onRequest { store.deleteToken() }
        let model = model(transport, store: store)

        await model.load()

        XCTAssertEqual(told.accounts, [], "the token was gone when the answer came")
    }

    func test_E017_AC2_theStoredLanguageIsToldWhenTheAccountAnswers() async {
        let model = model(StubTransport(json: Accounts.anna(preferredLocale: "en")))

        await model.load()

        XCTAssertEqual(told.locales, [.en])
    }

    func test_E017_AC1_aFailedReadIsFailed() async {
        let model = model(StubTransport(status: .internalServerError))

        await model.load()

        XCTAssertEqual(model.state, .failed)
    }

    func test_E017_AC3_aRefreshReadsTheAccountAgainWithoutShowingTheLoadingState() async {
        let transport = StubTransport(json: Accounts.sarah())
        let model = model(transport)
        await model.load()
        let loaded = model.state

        await model.refresh()

        XCTAssertEqual(model.state, loaded)
        XCTAssertEqual(transport.requests.count, 2)
    }

    func test_E017_AC3_aRefreshThatFailsChangesNothing() async {
        let model = model(StubTransport(status: .internalServerError))

        await model.refresh()

        XCTAssertEqual(model.state, .loading, "nothing was shown before, and nothing is shown now")
    }

    func test_E017_AC1_theBearerTokenGoesWithTheRead() async {
        let transport = StubTransport(json: Accounts.anna())

        await model(transport).load()

        XCTAssertEqual(transport.requests.map(\.path), ["/api/v1/me"])
        XCTAssertEqual(transport.requests.map { $0.headerFields[.authorization] }, ["Bearer \(Accounts.token)"])
    }

    // MARK: AC2: sign-out

    func test_E017_AC2_signOutDeletesTheTokenAndSendsItOnTheSignOutRequest() async {
        let store = InMemorySessionStore(token: Accounts.token)
        let transport = StubTransport(status: .noContent)
        let model = model(transport, store: store)

        await model.signOut()

        XCTAssertNil(store.token, "the token is gone")
        XCTAssertEqual(transport.requests.map(\.path), ["/api/v1/sign-out"])
        XCTAssertEqual(transport.requests.map(\.method), [.post])
        XCTAssertEqual(
            transport.requests.map { $0.headerFields[.authorization] }, ["Bearer \(Accounts.token)"],
            "the request carries the token that was deleted, so the server ends that session"
        )
        XCTAssertEqual(told.rejections, [false])
        XCTAssertFalse(model.isSigningOut)
    }

    func test_E017_AC2_aRefusedTokenOfTheSignOutShowsTheNotice() async {
        let model = model(StubTransport(status: .unauthorized, json: #"{"code":"not_signed_in"}"#))

        await model.signOut()

        XCTAssertEqual(told.rejections, [true])
    }

    func test_E017_AC2_aConnectionThatHangsIsNotWaitedForLongerThanTheTimeout() async {
        let store = InMemorySessionStore(token: Accounts.token)
        let model = model(HangingTransport(), store: store, signOutTimeout: .milliseconds(50))

        await model.signOut()

        XCTAssertNil(store.token)
        XCTAssertEqual(told.rejections, [false], "the sign-in screen shows, without the notice")
    }

    func test_E017_AC2_aSecondTapWhileSigningOutIsIgnored() async {
        let model = model(StubTransport(status: .noContent))

        async let first: Void = model.signOut()
        async let second: Void = model.signOut()
        _ = await (first, second)

        XCTAssertEqual(told.rejections.count, 1)
    }
}

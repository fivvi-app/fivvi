import FivviAPI
import XCTest

@testable import FivviPro

/// Which screen the app opens on, and what turns a rejected token into the sign-in screen.
@MainActor
final class SessionTests: XCTestCase {
    func test_F001N_AC13_noTokenShowsSignIn() {
        let session = Session(store: InMemorySessionStore())

        XCTAssertEqual(session.state, .signedOut(afterRejection: false))
    }

    func test_F001N_AC8_storedTokenOpensHome() {
        let session = Session(store: InMemorySessionStore(token: "stored"))

        XCTAssertEqual(session.state, .signedIn)
    }

    func test_F001N_AC3_signedInShowsHome() {
        let session = Session(store: InMemorySessionStore())

        session.signedIn()

        XCTAssertEqual(session.state, .signedIn)
    }

    func test_F001N_AC10_signedOutShowsSignInWithoutNotice() {
        let session = Session(store: InMemorySessionStore(token: "stored"))

        session.signedOut()

        XCTAssertEqual(session.state, .signedOut(afterRejection: false))
    }

    func test_F001N_AC10_signedOutAfterARefusedSignOutShowsTheNotice() {
        let session = Session(store: InMemorySessionStore(token: "stored"))

        session.signedOut(afterRejection: true)

        XCTAssertEqual(session.state, .signedOut(afterRejection: true))
    }

    func test_F001N_AC10_signedOutKeepsTheNoticeOfARejectedToken() {
        let session = Session(store: InMemorySessionStore(token: "stored"))
        session.tokenRejected()

        session.signedOut()

        XCTAssertEqual(session.state, .signedOut(afterRejection: true))
    }

    /// The whole chain on the real client: the home asks for the account, the API answers 401, the token goes and the
    /// app shows the sign-in screen with the notice.
    func test_F001N_AC9_unauthorizedDeletesTokenAndShowsNotice() async throws {
        let store = InMemorySessionStore(token: "expired")
        let session = Session(store: store)
        let transport = StubTransport(status: .unauthorized, json: #"{"code":"unauthorized"}"#)
        let middleware = AuthMiddleware(store: store) { await session.tokenRejected() }
        let client = Client(
            serverURL: try XCTUnwrap(URL(string: "https://example.com/api")),
            transport: transport,
            middlewares: [middleware]
        )
        let account = AccountViewModel(
            api: client, store: store, onSignedOut: { session.signedOut(afterRejection: $0) }
        )
        XCTAssertEqual(session.state, .signedIn)

        await account.load()

        XCTAssertNil(store.token)
        XCTAssertEqual(session.state, .signedOut(afterRejection: true))
        XCTAssertEqual(account.state, .failed)
    }

    /// Sign out on the real client: `POST /v1/sign-out` carries the token, which is deleted afterwards, and the app
    /// shows the sign-in screen without the notice.
    func test_F001N_AC10_signOutSendsTheTokenThenShowsSignIn() async throws {
        let store = InMemorySessionStore(token: "t-123")
        let session = Session(store: store)
        let transport = StubTransport(status: .noContent)
        let middleware = AuthMiddleware(store: store) { await session.tokenRejected() }
        let client = Client(
            serverURL: try XCTUnwrap(URL(string: "https://example.com/api")),
            transport: transport,
            middlewares: [middleware]
        )
        let account = AccountViewModel(
            api: client, store: store, onSignedOut: { session.signedOut(afterRejection: $0) }
        )

        await account.signOut()

        let request = try XCTUnwrap(transport.requests.first)
        XCTAssertEqual(request.method, .post)
        XCTAssertEqual(request.path, "/v1/sign-out")
        XCTAssertEqual(request.headerFields[.authorization], "Bearer t-123")
        XCTAssertNil(store.token)
        XCTAssertEqual(session.state, .signedOut(afterRejection: false))
    }

    /// The token was already refused: the 401 to the sign-out call itself shows the notice (the sign-out call is the
    /// view model's business, the middleware leaves its 401 alone), and signing out does not take it away.
    func test_F001N_AC10_signOutWithARefusedTokenKeepsTheNotice() async throws {
        let store = InMemorySessionStore(token: "expired")
        let session = Session(store: store)
        let transport = StubTransport(status: .unauthorized, json: #"{"code":"unauthorized"}"#)
        let middleware = AuthMiddleware(store: store) { await session.tokenRejected() }
        let client = Client(
            serverURL: try XCTUnwrap(URL(string: "https://example.com/api")),
            transport: transport,
            middlewares: [middleware]
        )
        let account = AccountViewModel(
            api: client, store: store, onSignedOut: { session.signedOut(afterRejection: $0) }
        )

        await account.signOut()

        XCTAssertNil(store.token)
        XCTAssertEqual(session.state, .signedOut(afterRejection: true))
    }
}

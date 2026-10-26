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

    func test_F001N_AC4_storedTokenOpensHome() {
        let session = Session(store: InMemorySessionStore(token: "stored"))

        XCTAssertEqual(session.state, .signedIn)
    }

    func test_F001N_AC3_signedInShowsHome() {
        let session = Session(store: InMemorySessionStore())

        session.signedIn()

        XCTAssertEqual(session.state, .signedIn)
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
        let account = AccountViewModel(api: client)
        XCTAssertEqual(session.state, .signedIn)

        await account.load()

        XCTAssertNil(store.token)
        XCTAssertEqual(session.state, .signedOut(afterRejection: true))
        XCTAssertEqual(account.state, .failed)
    }
}

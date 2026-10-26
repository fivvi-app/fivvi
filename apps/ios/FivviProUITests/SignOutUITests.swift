import XCTest

/// Sign out from the signed-in home, with and without a connection (F001 AC10). All run in nl and en.
@MainActor
final class SignOutUITests: SignInUITestCase {
    func test_F001N_AC10_signOutShowsSignIn() throws {
        let catalog = TestCatalog.configured
        let server = try StubServer(.greeting(key: "hello.title"))
        let screen = SignInScreen.launch(against: server, session: .signedIn)
        XCTAssertTrue(screen.signedInAs.waitUntilExists(timeout: timeout))
        XCTAssertEqual(screen.signOut.label, catalog["signOut.label"])
        try assertTouchTarget(screen.signOut, on: screen)

        screen.signOut.tap()

        XCTAssertTrue(screen.email.waitUntilExists(timeout: timeout))
        XCTAssertFalse(screen.notice.exists, "the person signed out themselves: no notice")
        XCTAssertFalse(screen.signedInAs.exists)
        let signOuts = server.requests(to: "/api/v1/sign-out")
        XCTAssertEqual(signOuts.map(\.method), ["POST"])
        XCTAssertEqual(signOuts.map(\.authorization), ["Bearer \(server.signIn.token)"])
        screen.app.terminate()

        let again = SignInScreen.launch(against: server, session: .asLeft)

        XCTAssertTrue(again.email.waitUntilExists(timeout: timeout), "the token is gone: the app starts signed out")
        XCTAssertFalse(again.signedInAs.exists)
        XCTAssertEqual(server.requests(to: "/api/v1/me").count, 1, "no authenticated call after sign out")
    }

    func test_F001N_AC10_signOutOfflineStillShowsSignIn() throws {
        let server = try StubServer(.greeting(key: "hello.title"))
        let screen = SignInScreen.launch(against: server, session: .signedIn)
        XCTAssertTrue(screen.signedInAs.waitUntilExists(timeout: timeout))
        server.setOffline(true)

        screen.signOut.tap()

        XCTAssertTrue(screen.email.waitUntilExists(timeout: timeout))
        XCTAssertFalse(screen.notice.exists)
        screen.app.terminate()
        server.setOffline(false)

        let again = SignInScreen.launch(against: server, session: .asLeft)

        XCTAssertTrue(again.email.waitUntilExists(timeout: timeout), "the token was deleted without a connection")
    }
}

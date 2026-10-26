import XCTest

/// TM-01 and the way into the signed-in home, against the stub server (F001, spec #168). All of them run in nl and en:
/// the copy comes from the catalog of the configuration's language.
@MainActor
final class SignInUITests: XCTestCase {
    private let timeout: TimeInterval = 10

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func test_F001N_AC13_launchesOnSignIn() throws {
        let catalog = TestCatalog.configured
        let server = try StubServer(.greeting(key: "hello.title"))

        let screen = SignInScreen.launch(against: server)

        XCTAssertTrue(screen.email.waitUntilExists(timeout: timeout))
        XCTAssertEqual(screen.title.label, catalog["signIn.title"])
        XCTAssertEqual(screen.sendCode.label, catalog["signIn.sendCode"])
        XCTAssertFalse(screen.signedInAs.exists)
        XCTAssertFalse(screen.notice.exists)
        XCTAssertTrue(server.requests.isEmpty, "no API call before the person signs in: \(server.requests)")
        try assertTouchTarget(screen.sendCode, on: screen)
        try assertTouchTarget(screen.email, on: screen)
    }

    /// The whole chain: the email step, the code step (the sixth digit submits), the token in the Keychain and
    /// `GET /api/v1/me` with it.
    func test_F001N_AC3_emailThenCodeShowsTheSignedInHome() throws {
        let catalog = TestCatalog.configured
        let server = try StubServer(.greeting(key: "hello.title"))
        let screen = SignInScreen.launch(against: server)
        XCTAssertTrue(screen.email.waitUntilExists(timeout: timeout))

        screen.type(server.signIn.email, into: screen.email)
        screen.sendCode.tap()

        XCTAssertTrue(screen.code.waitUntilExists(timeout: timeout))
        XCTAssertEqual(
            screen.checkEmail.label, String(format: catalog["signIn.checkEmailBodyApp"], server.signIn.email)
        )
        let signInRequests = server.requests(to: "/api/v1/sign-in/request")
        XCTAssertEqual(signInRequests.map(\.body), [["email": server.signIn.email, "locale": catalog.apiLocale]])

        screen.type(server.signIn.code, into: screen.code)

        XCTAssertTrue(screen.signedInAs.waitUntilExists(timeout: timeout))
        XCTAssertEqual(screen.signedInAs.label, String(format: catalog["home.signedInAs"], server.signIn.email))
        XCTAssertTrue(screen.greeting.waitUntilExists(timeout: timeout), "the home keeps the hello screen")
        XCTAssertFalse(screen.email.exists)
        XCTAssertEqual(
            server.requests(to: "/api/v1/sign-in/token").map(\.body),
            [["email": server.signIn.email, "code": server.signIn.code]]
        )
        let accountRequests = server.requests(to: "/api/v1/me")
        XCTAssertEqual(accountRequests.map(\.authorization), ["Bearer \(server.signIn.token)"])
    }

    func test_F001N_AC6_wrongCodeShowsTheNeutralMessageAndAllowsAnotherTry() throws {
        let catalog = TestCatalog.configured
        let server = try StubServer(.greeting(key: "hello.title"))
        let screen = SignInScreen.launch(against: server)
        XCTAssertTrue(screen.email.waitUntilExists(timeout: timeout))
        screen.type(server.signIn.email, into: screen.email)
        screen.sendCode.tap()
        XCTAssertTrue(screen.code.waitUntilExists(timeout: timeout))

        screen.type("000000", into: screen.code)

        XCTAssertTrue(screen.error.waitUntilExists(timeout: timeout))
        XCTAssertEqual(screen.error.label, catalog["signIn.errors.invalidOrExpiredCode"])
        XCTAssertFalse(screen.signedInAs.exists)
        XCTAssertTrue(screen.code.exists, "the code field is ready for another try")

        screen.type(server.signIn.code, into: screen.code)

        XCTAssertTrue(screen.signedInAs.waitUntilExists(timeout: timeout))
    }

    /// The token is in the Keychain, so the app opens on the home after a restart without TM-01.
    func test_F001N_AC8_aRestartKeepsTheSignIn() throws {
        let server = try StubServer(.greeting(key: "hello.title"))
        let first = SignInScreen.launch(against: server)
        XCTAssertTrue(first.email.waitUntilExists(timeout: timeout))
        first.type(server.signIn.email, into: first.email)
        first.sendCode.tap()
        XCTAssertTrue(first.code.waitUntilExists(timeout: timeout))
        first.type(server.signIn.code, into: first.code)
        XCTAssertTrue(first.signedInAs.waitUntilExists(timeout: timeout))
        first.app.terminate()

        let again = SignInScreen.launch(against: server, session: .asLeft)

        XCTAssertTrue(again.signedInAs.waitUntilExists(timeout: timeout))
        XCTAssertFalse(again.email.exists)
        XCTAssertEqual(server.requests(to: "/api/v1/me").count, 2)
    }

    func test_F001N_AC9_aRejectedTokenShowsTheSignedOutNotice() throws {
        let catalog = TestCatalog.configured
        let server = try StubServer(.greeting(key: "hello.title"))

        let screen = SignInScreen.launch(against: server, session: .rejectedToken)

        XCTAssertTrue(screen.notice.waitUntilExists(timeout: timeout))
        XCTAssertEqual(screen.notice.label, catalog["signIn.signedOutNotice"])
        XCTAssertTrue(screen.email.exists)
        XCTAssertFalse(screen.signedInAs.exists)
        XCTAssertEqual(server.requests(to: "/api/v1/me").map(\.authorization), ["Bearer token-the-server-rejects"])
    }

    /// `element` is at least the minimum touch target, compared in the screen's device pixels (`TouchTarget`).
    private func assertTouchTarget(_ element: XCUIElement, on screen: SignInScreen) throws {
        let size = element.frame.size
        let scale = try screen.app.screenshotBitmap().scale
        XCTAssertTrue(
            TouchTarget.isMet(by: size, scale: scale),
            "\(element.identifier) is \(size.width) × \(size.height) pt at \(scale)x, "
                + "below the \(TouchTarget.minimum) pt touch target"
        )
    }
}

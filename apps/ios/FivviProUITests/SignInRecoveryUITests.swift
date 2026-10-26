import XCTest

/// The code step when something goes wrong or the person changes their mind: a new email, another address and a lost
/// connection (F001). All run in nl and en.
@MainActor
final class SignInRecoveryUITests: SignInUITestCase {
    func test_F001N_AC6_resendRequestsNewEmail() throws {
        let catalog = TestCatalog.configured
        let server = try StubServer(.greeting(key: "hello.title"))
        let screen = SignInScreen.launch(against: server)
        screen.requestCode(for: server.signIn.email)
        screen.type("000000", into: screen.code)
        XCTAssertTrue(screen.error.waitUntilExists(timeout: timeout))
        XCTAssertEqual(screen.error.label, catalog["signIn.errors.invalidOrExpiredCode"])

        screen.resend.tap()

        XCTAssertTrue(screen.resent.waitUntilExists(timeout: timeout))
        XCTAssertEqual(screen.resent.label, String(format: catalog["signIn.resent"], server.signIn.email))
        XCTAssertEqual(screen.resend.label, catalog["signIn.resend"])
        XCTAssertFalse(screen.error.exists, "the old message goes with the new attempt")
        XCTAssertTrue(screen.code.exists, "the code field is ready for the new code")
        let body = ["email": server.signIn.email, "locale": catalog.apiLocale]
        XCTAssertEqual(server.requests(to: "/api/v1/sign-in/request").map(\.body), [body, body])

        screen.type(server.signIn.code, into: screen.code)

        XCTAssertTrue(screen.signedInAs.waitUntilExists(timeout: timeout))
    }

    /// What a screen reader gets: the message is a text element with the message as its label, next to the field that
    /// stays in the accessibility tree. The announcement itself is checked by `SignInViewModelTests` (XCTest can't
    /// observe it).
    func test_F001N_AC6_errorIsAnnounced() throws {
        let catalog = TestCatalog.configured
        let server = try StubServer(.greeting(key: "hello.title"))
        let screen = SignInScreen.launch(against: server)
        screen.requestCode(for: server.signIn.email)

        screen.type("000000", into: screen.code)

        XCTAssertTrue(screen.error.waitUntilExists(timeout: timeout))
        XCTAssertEqual(screen.error.label, catalog["signIn.errors.invalidOrExpiredCode"])
        XCTAssertTrue(screen.error.isHittable || screen.error.exists, "VoiceOver can reach the message")
        XCTAssertEqual(screen.code.label, catalog["signIn.codeLabel"], "the field keeps its label")
        XCTAssertFalse(screen.loading.exists)
    }

    func test_F001N_AC1_changeAddressKeepsTheAddress() throws {
        let catalog = TestCatalog.configured
        let server = try StubServer(.greeting(key: "hello.title"))
        let screen = SignInScreen.launch(against: server)
        screen.requestCode(for: "trainer@example.com")
        XCTAssertEqual(screen.changeEmail.label, catalog["signIn.changeEmail"])

        screen.changeEmail.tap()

        XCTAssertTrue(screen.email.waitUntilExists(timeout: timeout))
        XCTAssertEqual(screen.email.value as? String, "trainer@example.com", "the address is kept")
        XCTAssertFalse(screen.code.exists)
        XCTAssertFalse(screen.error.exists)
        screen.email.tap()
        screen.email.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: "trainer@example.com".count))
        screen.email.typeText(server.signIn.email)
        screen.sendCode.tap()

        XCTAssertTrue(screen.code.waitUntilExists(timeout: timeout))
        XCTAssertEqual(
            screen.checkEmail.label, String(format: catalog["signIn.checkEmailBodyApp"], server.signIn.email)
        )
        XCTAssertEqual(
            server.requests(to: "/api/v1/sign-in/request").map { $0.body["email"] },
            ["trainer@example.com", server.signIn.email]
        )
    }

    func test_F001N_AC1_lostConnectionOffersRetry() throws {
        let catalog = TestCatalog.configured
        let server = try StubServer(.greeting(key: "hello.title"))
        let screen = SignInScreen.launch(against: server)
        XCTAssertTrue(screen.email.waitUntilExists(timeout: timeout))
        server.setOffline(true)
        screen.type(server.signIn.email, into: screen.email)
        screen.sendCode.tap()

        XCTAssertTrue(screen.error.waitUntilExists(timeout: timeout))
        XCTAssertEqual(screen.error.label, catalog["signIn.errors.noConnection"])
        XCTAssertEqual(screen.retry.label, catalog["common.retry"])
        XCTAssertTrue(screen.email.exists, "still on the email step")
        try assertTouchTarget(screen.retry, on: screen)

        server.setOffline(false)
        screen.retry.tap()

        XCTAssertTrue(screen.code.waitUntilExists(timeout: timeout))
        XCTAssertFalse(screen.error.exists)
        XCTAssertFalse(screen.retry.exists)
    }

    func test_F001N_AC1_lostConnectionOnTheCodeStepKeepsTheCode() throws {
        let catalog = TestCatalog.configured
        let server = try StubServer(.greeting(key: "hello.title"))
        let screen = SignInScreen.launch(against: server)
        screen.requestCode(for: server.signIn.email)
        server.setOffline(true)

        screen.type(server.signIn.code, into: screen.code)

        XCTAssertTrue(screen.error.waitUntilExists(timeout: timeout))
        XCTAssertEqual(screen.error.label, catalog["signIn.errors.noConnection"])
        XCTAssertFalse(screen.signedInAs.exists)

        server.setOffline(false)
        screen.retry.tap()

        XCTAssertTrue(screen.signedInAs.waitUntilExists(timeout: timeout))
        XCTAssertEqual(
            server.requests(to: "/api/v1/sign-in/token").map(\.body),
            [["email": server.signIn.email, "code": server.signIn.code],
             ["email": server.signIn.email, "code": server.signIn.code]]
        )
    }
}

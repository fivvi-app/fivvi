import XCTest

/// Dynamic Type, touch targets and what VoiceOver reads on TM-01 and the signed-in home (F001 AC15).
@MainActor
final class SignInAccessibilityUITests: SignInUITestCase {
    /// At the largest text size every text wraps: no clipped text, nothing wider than the window, on the email step,
    /// the code step with its messages, and the signed-in home.
    func test_F001N_AC15_largestTextSizeWraps() throws {
        let server = try StubServer(.greeting(key: "hello.title"))
        let screen = SignInScreen.launch(
            against: server, session: .rejectedToken, textSize: "UICTContentSizeCategoryAccessibilityXXXL"
        )
        XCTAssertTrue(screen.notice.waitUntilExists(timeout: timeout))
        try assertReadable(screen, [screen.title, screen.notice, screen.email, screen.sendCode])

        screen.requestCode(for: server.signIn.email)
        screen.type("000000", into: screen.code)
        XCTAssertTrue(screen.error.waitUntilExists(timeout: timeout))
        screen.tap(screen.resend)
        XCTAssertTrue(screen.resent.waitUntilExists(timeout: timeout))
        try assertReadable(
            screen, [screen.checkEmail, screen.code, screen.resent, screen.submit, screen.resend, screen.changeEmail]
        )

        screen.type("000000", into: screen.code)
        XCTAssertTrue(screen.error.waitUntilExists(timeout: timeout))
        try assertReadable(screen, [screen.error])

        screen.type(server.signIn.code, into: screen.code)
        XCTAssertTrue(screen.signedInAs.waitUntilExists(timeout: timeout))
        try assertReadable(screen, [screen.signedInAs, screen.signOut, screen.greeting])
    }

    /// Every button keeps the 44 pt touch target, at the default text size.
    func test_F001N_AC15_touchTargets() throws {
        let server = try StubServer(.greeting(key: "hello.title"))
        let screen = SignInScreen.launch(against: server)
        XCTAssertTrue(screen.email.waitUntilExists(timeout: timeout))
        try assertTouchTarget(screen.email, on: screen)
        try assertTouchTarget(screen.sendCode, on: screen)

        screen.requestCode(for: server.signIn.email)
        screen.type("000", into: screen.code)
        try assertTouchTarget(screen.code, on: screen)
        for button in [screen.submit, screen.resend, screen.changeEmail] {
            try assertTouchTarget(button, on: screen)
        }

        screen.app.terminate()
        let home = SignInScreen.launch(against: server, session: .signedIn)
        XCTAssertTrue(home.signOut.waitUntilExists(timeout: timeout))
        try assertTouchTarget(home.signOut, on: home)
    }

    /// VoiceOver reads each field with its label, the spinner as "loading", and the buttons with their text.
    func test_F001N_AC15_fieldsAndLoadingAreLabelled() throws {
        let catalog = TestCatalog.configured
        let server = try StubServer(.greeting(key: "hello.title"))
        let screen = SignInScreen.launch(against: server)
        XCTAssertTrue(screen.email.waitUntilExists(timeout: timeout))
        XCTAssertEqual(screen.email.label, catalog["signIn.emailLabel"])
        XCTAssertTrue(try screen.title.hasTrait(.header))
        server.holdSignInRequests(true)
        screen.type(server.signIn.email, into: screen.email)
        screen.sendCode.tap()

        XCTAssertTrue(screen.loading.waitUntilExists(timeout: timeout))
        XCTAssertEqual(screen.loading.label, catalog["common.loading"])

        server.holdSignInRequests(false)

        XCTAssertTrue(screen.code.waitUntilExists(timeout: timeout))
        XCTAssertEqual(screen.code.label, catalog["signIn.codeLabel"])
        XCTAssertEqual(screen.submit.label, catalog["signIn.submitCode"])
        XCTAssertFalse(screen.loading.exists)
    }
}

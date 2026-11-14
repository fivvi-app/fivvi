import FivviDesignTokens
import XCTest

/// Dynamic Type, touch targets and what VoiceOver reads on TM-01 and the signed-in home (F001 AC15).
@MainActor
final class SignInAccessibilityUITests: SignInUITestCase {
    /// At the largest text size every text wraps: no clipped text, nothing wider than the window, on the email step,
    /// the lost-connection message with its retry button, the code step with its messages, and the signed-in home.
    func test_F001N_AC15_largestTextSizeWraps() throws {
        let server = try StubServer(.greeting(key: "hello.title"))
        let screen = SignInScreen.launch(
            against: server, session: .rejectedToken, textSize: AppLaunch.largestTextSize
        )
        XCTAssertTrue(screen.notice.waitUntilExists(timeout: timeout))
        try assertReadable(screen, [screen.title, screen.notice, screen.email, screen.sendCode])

        try screen.requestCodeOfflineThenRetry(for: server.signIn.email, on: server) {
            try assertReadable(screen, [screen.error, screen.retry])
        }

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

    /// E020 AC15: the audit with the contrast check on both steps of TM-01 (with their messages) and on the signed-in
    /// home, in light and dark. Only the secondary text token is accepted as low contrast (`auditWithContrast`).
    func test_E020_AC15_signInAndHomePassTheAccessibilityAuditInLightAndDark() throws {
        let server = try StubServer(.greeting(key: "hello.title"))
        for (mode, style) in [("light", UIUserInterfaceStyle.light), ("dark", .dark)] {
            let screen = SignInScreen.launch(against: server, session: .rejectedToken, appearance: mode)
            XCTAssertTrue(screen.notice.waitUntilExists(timeout: timeout), mode)
            screen.settle(screen.sendCode)
            try auditWithContrast(screen.app, style: style, "email step, \(mode)")

            try screen.requestCodeOfflineThenRetry(for: server.signIn.email, on: server) {
                // The keyboard of the email field covers the button: the audit reads pixels, so bring it into view.
                screen.scrollIntoView(screen.retry)
                try auditWithContrast(screen.app, style: style, "lost connection, \(mode)")
            }
            screen.type("000000", into: screen.code)
            XCTAssertTrue(screen.error.waitUntilExists(timeout: timeout), mode)
            screen.settle(screen.error)
            screen.scrollIntoView(screen.changeEmail)
            try auditWithContrast(screen.app, style: style, "code step with its error, \(mode)")

            screen.type(server.signIn.code, into: screen.code)
            XCTAssertTrue(screen.signedInAs.waitUntilExists(timeout: timeout), mode)
            screen.settle(screen.signOut)
            try auditWithContrast(screen.app, style: style, "home, \(mode)")
            screen.app.terminate()
        }
    }

    /// E020 AC15: the audit's contrast acceptance (`textPasses`) looks at the background drawn behind the text: the white
    /// label of the primary pill on the accent fill is not accepted, in light and dark, although white on black (or any
    /// text token) would pass 4.5:1 against the canvas.
    func test_E020_AC15_contrastAcceptanceRejectsTextOnTheAccent() throws {
        let server = try StubServer(.greeting(key: "hello.title"))
        for (mode, style) in [("light", UIUserInterfaceStyle.light), ("dark", .dark)] {
            let screen = SignInScreen.launch(against: server, session: .rejectedToken, appearance: mode)
            XCTAssertTrue(screen.email.waitUntilExists(timeout: timeout), mode)
            screen.type(server.signIn.email, into: screen.email)
            screen.scrollIntoView(screen.sendCode)
            screen.settle(screen.sendCode)
            let colours = try ScreenColours(screen.app)
            let backgrounds = [RGB(Tokens.Colors.bgCanvas, in: style), RGB(Tokens.Colors.bgSurface, in: style)]
            // The precondition: the pill is on screen, above the keyboard, enabled, and drawn in the accent fill, so
            // the rejection below is the acceptance's and not a covered or missed frame.
            let keyboard = screen.app.keyboards.firstMatch
            XCTAssertTrue(screen.sendCode.isEnabled, "the primary pill is enabled, \(mode)")
            XCTAssertTrue(
                !keyboard.exists || screen.sendCode.frame.maxY <= keyboard.frame.minY,
                "the primary pill is not under the keyboard, \(mode)"
            )
            let drawn = colours.dominant(in: screen.sendCode.frame.insetBy(dx: 1, dy: 1))
            XCTAssertLessThanOrEqual(
                drawn.distance(to: RGB(Tokens.Colors.actionPrimaryBg, in: style)), 8,
                "the pill is drawn in the accent fill (\(drawn)), \(mode)"
            )
            let passes = textPasses(
                screen.sendCode, in: colours, style: style, backgrounds: backgrounds,
                secondary: RGB(Tokens.Colors.textSecondary, in: style)
            )
            XCTAssertFalse(passes, "the primary pill's white label on the accent is not accepted, \(mode)")
            screen.app.terminate()
        }
    }

    /// Every button keeps the 44 pt touch target, at the default text size.
    func test_F001N_AC15_touchTargets() throws {
        let server = try StubServer(.greeting(key: "hello.title"))
        let screen = SignInScreen.launch(against: server)
        XCTAssertTrue(screen.email.waitUntilExists(timeout: timeout))
        try assertTouchTarget(screen.email, on: screen)
        try assertTouchTarget(screen.sendCode, on: screen)

        try screen.requestCodeOfflineThenRetry(for: server.signIn.email, on: server) {
            try assertTouchTarget(screen.retry, on: screen)
        }
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
        screen.tap(screen.sendCode)

        XCTAssertTrue(screen.loading.waitUntilExists(timeout: timeout))
        XCTAssertEqual(screen.loading.label, catalog["common.loading"])

        server.holdSignInRequests(false)

        XCTAssertTrue(screen.code.waitUntilExists(timeout: timeout))
        XCTAssertEqual(screen.code.label, catalog["signIn.codeLabel"])
        XCTAssertEqual(screen.submit.label, catalog["signIn.submitCode"])
        XCTAssertFalse(screen.loading.exists)
    }
}

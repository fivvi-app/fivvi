import XCTest

/// E020 AC15: the accessibility audit of *Profiel* (the workspaces with their mark and role, the switch *Ik geef zelf
/// ook trainingen in …* with its message, the language with its error) and of the name sheet with its error, in light and
/// dark. The audit includes the contrast check, which accepts only the secondary text token, and exempts only the name
/// sheet's system bar buttons and title, each for the issues listed at `auditWithContrast`.
@MainActor
final class ProfileAccessibilityUITests: SignInUITestCase {
    private func launchAsSarah(appearance: String, against server: StubServer) -> SignInScreen {
        SignInScreen(app: AppLaunch.launch(against: server, session: .signedIn, appearance: appearance))
    }

    private func makeServer() throws -> StubServer {
        try StubServer(
            .greeting(key: "hello.title"),
            signIn: StubServer.SignIn(
                email: "trainer@example.com", workspaceName: "John's Gym", role: "trainer",
                otherWorkspaces: [.init(name: "Sarah Personal Training", role: "owner")], name: "Sarah"
            )
        )
    }

    func test_E020_AC15_profielPassesTheAccessibilityAuditInLightAndDark() throws {
        let server = try makeServer()
        for (mode, style) in [("light", UIUserInterfaceStyle.light), ("dark", .dark)] {
            let screen = launchAsSarah(appearance: mode, against: server)
            let app = screen.app
            let open = app.buttons["home.openProfile"]
            XCTAssertTrue(open.waitUntilExists(timeout: timeout), mode)
            XCTAssertTrue(open.tap(until: app.staticTexts["profile.workspacesTitle"], timeout: timeout), mode)

            // The switch's message and the language error, so the audit sees them.
            let own = app.switches["profile.trainsHere.workspace-1"]
            XCTAssertTrue(own.waitUntilExists(timeout: timeout), mode)
            server.answerTrainerProfile(withStatus: 500)
            own.tap()
            let switchError = app.staticTexts["profile.trainsHereError.workspace-1"]
            XCTAssertTrue(switchError.waitUntilExists(timeout: timeout), mode)
            server.answerTrainerProfile(withStatus: nil)
            server.setOffline(true)
            let other = app.buttons.matching(identifier: "profile.language.nl-NL").firstMatch.isSelected
                ? app.buttons["profile.language.en"] : app.buttons["profile.language.nl-NL"]
            XCTAssertTrue(other.waitUntilExists(timeout: timeout), mode)
            other.tap()
            XCTAssertTrue(app.staticTexts["profile.language.error"].waitUntilExists(timeout: timeout), mode)
            server.setOffline(false)
            screen.settle(app.staticTexts["profile.language.error"])

            try auditWithContrast(app, style: style, "Profiel top, \(mode)")
            app.swipeUp()
            app.swipeUp()
            // The audit reads pixels: wait until the scroll has come to rest.
            screen.settle(app.buttons["profile.privacy"])
            try auditWithContrast(app, style: style, "Profiel bottom, \(mode)")
            app.terminate()
        }
    }

    func test_E020_AC15_nameSheetWithItsErrorPassesTheAccessibilityAuditInLightAndDark() throws {
        let server = try makeServer()
        for (mode, style) in [("light", UIUserInterfaceStyle.light), ("dark", .dark)] {
            let screen = launchAsSarah(appearance: mode, against: server)
            let app = screen.app
            let open = app.buttons["home.openProfile"]
            XCTAssertTrue(open.waitUntilExists(timeout: timeout), mode)
            XCTAssertTrue(open.tap(until: app.buttons["profile.name"], timeout: timeout), mode)
            app.buttons["profile.name"].tap()
            let input = app.textFields["profile.nameInput"]
            XCTAssertTrue(input.waitUntilExists(timeout: timeout), mode)
            input.focus()
            input.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 5) + "   ")
            app.buttons["profile.nameSave"].tap()
            let message = TestCatalog.configured["myProfile.errors.nameRequired"]
            XCTAssertTrue(Polling.until(timeout: timeout, interval: 0.2) { input.label.hasSuffix(message) }, mode)
            screen.settle(input)

            try auditWithContrast(
                app, style: style, "name sheet with its error, \(mode)",
                systemBarItems: ["profile.nameCancel", "profile.nameSave", "profile.nameEditor"],
                systemBarTitle: "profile.nameEditor"
            )
            app.terminate()
        }
    }
}

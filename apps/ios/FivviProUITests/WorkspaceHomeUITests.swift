import XCTest

/// What the signed-in home shows from `GET /api/v1/me` (F002 AC10), in nl and en: the workspace, the text to set one up
/// on the web with a button that opens the browser, or the no-access text with sign out.
@MainActor
final class WorkspaceHomeUITests: SignInUITestCase {
    private func launch(workspace: String?, canCreate: Bool) throws -> (SignInScreen, StubServer) {
        let server = try StubServer(signIn: StubServer.SignIn(workspaceName: workspace, canCreateWorkspace: canCreate))
        return (SignInScreen.launch(against: server, session: .signedIn), server)
    }

    func test_F002_AC10_workspaceHomeShowsTheWorkspaceName() throws {
        let (screen, _) = try launch(workspace: "John's Gym", canCreate: false)

        XCTAssertTrue(screen.app.staticTexts["home.workspaceName"].waitUntilExists(timeout: timeout))
        XCTAssertEqual(screen.app.staticTexts["home.workspaceName"].label, "John's Gym")
        XCTAssertFalse(screen.app.buttons["home.openWeb"].exists)
        XCTAssertFalse(screen.app.staticTexts["home.noAccess"].exists)
    }

    func test_F002_AC10_noWorkspaceSaysToSetItUpOnTheWebAndOpensTheBrowser() throws {
        let catalog = TestCatalog.configured
        let (screen, _) = try launch(workspace: nil, canCreate: true)
        let button = screen.app.buttons["home.openWeb"]

        XCTAssertTrue(button.waitUntilExists(timeout: timeout))
        XCTAssertEqual(screen.app.staticTexts["home.setUpOnWeb"].label, catalog["home.setUpOnWeb"])
        XCTAssertEqual(button.label, catalog["home.openWeb"])
        try assertTouchTarget(button, on: screen)
        XCTAssertFalse(screen.app.staticTexts["home.workspaceName"].exists)
        XCTAssertFalse(screen.app.staticTexts["home.noAccess"].exists)

        button.tap()

        let browser = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
        let opened = browser.wait(for: .runningForeground, timeout: externalAppLaunchTimeout)
        XCTAssertTrue(opened, "the system browser opens, not a web view")
        browser.terminate()
    }

    func test_F002_AC10_aFailedAccountCallShowsRetryAndNoWorkspace() throws {
        let server = try StubServer(signIn: StubServer.SignIn(meStatus: 503))
        let screen = SignInScreen.launch(against: server, session: .signedIn)

        XCTAssertTrue(screen.homeRetry.waitUntilExists(timeout: timeout))
        XCTAssertFalse(screen.app.staticTexts["home.workspaceName"].exists)
    }

    func test_F002_AC10_setUpOnTheWebWrapsAtTheLargestTextSize() throws {
        let server = try StubServer(signIn: StubServer.SignIn(workspaceName: nil, canCreateWorkspace: true))
        let screen = SignInScreen.launch(against: server, session: .signedIn, textSize: AppLaunch.largestTextSize)
        let button = screen.app.buttons["home.openWeb"]

        XCTAssertTrue(button.waitUntilExists(timeout: timeout))
        screen.scrollIntoView(screen.app.staticTexts["home.setUpOnWeb"])
        screen.scrollIntoView(button)
        try assertReadable(screen, [screen.app.staticTexts["home.setUpOnWeb"], button], wholeInWindow: true)
        try assertTouchTarget(button, on: screen)
    }

    func test_F002_AC10_noAccessShowsTheTextAndSignsOut() throws {
        let catalog = TestCatalog.configured
        let (screen, server) = try launch(workspace: nil, canCreate: false)

        XCTAssertTrue(screen.app.staticTexts["home.noAccess"].waitUntilExists(timeout: timeout))
        XCTAssertEqual(screen.app.staticTexts["home.noAccess"].label, catalog["noAccess.body"])
        let title = screen.app.staticTexts["home.noAccessTitle"]
        XCTAssertEqual(title.label, catalog["noAccess.title"])
        XCTAssertTrue(try title.hasTrait(.header))
        XCTAssertFalse(screen.app.buttons["home.openWeb"].exists)
        XCTAssertEqual(screen.signOut.label, catalog["signOut.label"])

        screen.signOut.tap()

        XCTAssertTrue(screen.email.waitUntilExists(timeout: timeout))
        XCTAssertEqual(server.requests(to: "/api/v1/sign-out").map(\.method), ["POST"])
    }

    /// F030 AC9, in nl and en (the test plan's two configurations): Mark has an account but no team role. He sees the
    /// no-access state with the line that points him to the Fivvi app, and no workspace data.
    func test_F030_AC9_clientInFivviProIsPointedToFivvi() throws {
        let catalog = TestCatalog.configured
        let server = try StubServer(signIn: StubServer.SignIn(
            email: "mark@example.com", workspaceName: nil, canCreateWorkspace: false))
        let screen = SignInScreen.launch(against: server, session: .signedIn)
        let hint = screen.app.staticTexts["home.noAccessClientHint"]

        XCTAssertTrue(hint.waitUntilExists(timeout: timeout))
        let expected = TestCatalog.configuredLanguage == "nl"
            ? "Ben je klant? Gebruik de app Fivvi." : "Are you a client? Use the Fivvi app."
        XCTAssertEqual(hint.label, expected)
        XCTAssertEqual(hint.label, catalog["noAccess.clientHint"])
        XCTAssertEqual(screen.app.staticTexts["home.noAccess"].label, catalog["noAccess.body"])
        XCTAssertFalse(screen.app.staticTexts["home.workspaceName"].exists)
        XCTAssertFalse(screen.app.buttons["home.openClients"].exists)
        XCTAssertFalse(screen.app.buttons["home.openWeb"].exists)
    }

    /// F030 AC9: the line is whole and readable at the largest text size.
    func test_F030_AC9_clientHintWrapsAtTheLargestTextSize() throws {
        let server = try StubServer(signIn: StubServer.SignIn(
            email: "mark@example.com", workspaceName: nil, canCreateWorkspace: false))
        let screen = SignInScreen.launch(against: server, session: .signedIn, textSize: AppLaunch.largestTextSize)
        let hint = screen.app.staticTexts["home.noAccessClientHint"]

        XCTAssertTrue(hint.waitUntilExists(timeout: timeout))
        screen.scrollIntoView(hint)
        try assertReadable(screen, [hint], wholeInWindow: true)
    }
}

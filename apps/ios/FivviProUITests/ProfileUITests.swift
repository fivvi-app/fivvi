import XCTest

/// *Profiel* (TM-04) and lost team access (F003), in nl and en: the workspaces with the role, and the home switching to
/// the no-access text, or to the other workspace, when the API says `404` for the workspace on screen.
@MainActor
final class ProfileUITests: SignInUITestCase {
    /// Sarah (synthetic): Trainer of John's Gym, Owner of Sarah Personal Training.
    private func launchAsSarah() throws -> (SignInScreen, StubServer) {
        let server = try StubServer(
            .greeting(key: "hello.title"),
            signIn: StubServer.SignIn(
                email: "trainer@example.com", workspaceName: "John's Gym", role: "trainer",
                otherWorkspaces: [.init(name: "Sarah Personal Training", role: "owner")]
            )
        )
        return (SignInScreen.launch(against: server, session: .signedIn), server)
    }

    func test_F003_AC9_profileListsWorkspacesWithRole() throws {
        let catalog = TestCatalog.configured
        let (screen, server) = try launchAsSarah()
        let open = screen.app.buttons["home.openProfile"]
        XCTAssertTrue(open.waitUntilExists(timeout: timeout))
        XCTAssertEqual(open.label, catalog["profile.title"])
        try assertTouchTarget(open, on: screen)

        open.tap()

        let title = screen.app.staticTexts["profile.workspacesTitle"]
        XCTAssertTrue(title.waitUntilExists(timeout: timeout))
        XCTAssertEqual(title.label, catalog["myProfile.workspacesTitle"])
        XCTAssertEqual(screen.app.staticTexts["profile.title"].label, catalog["profile.title"])
        XCTAssertEqual(screen.app.staticTexts["profile.workspaceName.workspace-0"].label, "John's Gym")
        XCTAssertEqual(screen.app.staticTexts["profile.workspaceRole.workspace-0"].label, catalog["roles.trainer"])
        XCTAssertEqual(screen.app.staticTexts["profile.workspaceName.workspace-1"].label, "Sarah Personal Training")
        XCTAssertEqual(screen.app.staticTexts["profile.workspaceRole.workspace-1"].label, catalog["roles.owner"])
        XCTAssertEqual(server.requests(to: "/api/v1/me/workspaces").map(\.authorization), ["Bearer stub-session-token"])
    }

    func test_F003_AC9_aFailedListShowsTheErrorAndRetryRecovers() throws {
        let catalog = TestCatalog.configured
        let (screen, server) = try launchAsSarah()
        server.setOffline(true)
        XCTAssertTrue(screen.app.buttons["home.openProfile"].waitUntilExists(timeout: timeout))
        screen.app.buttons["home.openProfile"].tap()

        let error = screen.app.staticTexts["profile.error"]
        XCTAssertTrue(error.waitUntilExists(timeout: timeout))
        XCTAssertEqual(error.label, catalog["profile.error"])
        server.setOffline(false)
        screen.app.buttons["profile.retry"].tap()

        XCTAssertTrue(screen.app.staticTexts["profile.workspaceName.workspace-0"].waitUntilExists(timeout: timeout))
    }

    func test_F003_AC6_workspaceGoneShowsNoAccess() throws {
        let catalog = TestCatalog.configured
        let server = try StubServer(
            .greeting(key: "hello.title"),
            signIn: StubServer.SignIn(email: "trainer@example.com", workspaceName: "John's Gym", role: "trainer")
        )
        let screen = SignInScreen.launch(against: server, session: .signedIn)
        XCTAssertTrue(screen.app.staticTexts["home.workspaceName"].waitUntilExists(timeout: timeout))

        server.removeFromTeam(workspace: 0)
        backgroundAndReopen(screen.app)

        let noAccess = screen.app.staticTexts["home.noAccess"]
        XCTAssertTrue(noAccess.waitUntilExists(timeout: timeout))
        XCTAssertEqual(noAccess.label, catalog["noAccess.body"])
        XCTAssertFalse(screen.app.staticTexts["home.workspaceName"].exists)
        XCTAssertTrue(screen.signOut.exists, "still signed in")
        XCTAssertTrue(server.requests(to: "/api/v1/sign-out").isEmpty)
    }

    func test_F003_AC6_workspaceGoneShowsTheOtherWorkspace() throws {
        let (screen, server) = try launchAsSarah()
        XCTAssertTrue(screen.app.staticTexts["home.workspaceName"].waitUntilExists(timeout: timeout))
        XCTAssertEqual(screen.app.staticTexts["home.workspaceName"].label, "John's Gym")

        server.removeFromTeam(workspace: 0)
        backgroundAndReopen(screen.app)

        let name = screen.app.staticTexts["home.workspaceName"]
        let isOther = Polling.until(timeout: timeout, interval: 0.3) {
            name.exists && name.label == "Sarah Personal Training"
        }
        XCTAssertTrue(isOther)
        XCTAssertFalse(screen.app.staticTexts["home.noAccess"].exists)
    }

    /// Sends the app to the background and brings it back, as a person returning to it.
    private func backgroundAndReopen(_ app: XCUIApplication) {
        XCUIDevice.shared.press(.home)
        _ = app.wait(for: .runningBackground, timeout: timeout)
        app.activate()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: timeout))
    }
}

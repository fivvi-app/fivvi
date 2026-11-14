import XCTest

/// Switching workspace in *Profiel* → *Mijn werkruimtes* and reopening the last one (F012, spec #423, AC6, AC7, AC10,
/// AC11), in nl and en. Sarah (synthetic) is Trainer of John's Gym and Owner of Sarah Personal Training; the stub
/// server gives each workspace clients of its own.
@MainActor
final class WorkspaceSwitchUITests: SignInUITestCase {
    private let johns = "profile.workspace.workspace-0"
    private let own = "profile.workspace.workspace-1"
    /// The stub server answers only while it is held, also when a test does not use it.
    private var server: StubServer?

    private func launchAsSarah(
        workspaces: [StubServer.Workspace] = [.init(name: "Sarah Personal Training", role: "owner")],
        session: AppLaunch.Session = .signedIn, deviceLanguages: [String]? = nil
    ) throws -> (SignInScreen, StubServer) {
        let server = try StubServer(
            .greeting(key: "hello.title"),
            signIn: StubServer.SignIn(
                email: "trainer@example.com", workspaceName: "John's Gym", role: "trainer", otherWorkspaces: workspaces
            )
        )
        self.server = server
        return (SignInScreen.launch(against: server, session: session, deviceLanguages: deviceLanguages), server)
    }

    private func openProfile(_ screen: SignInScreen) {
        let open = screen.app.buttons["home.openProfile"]
        XCTAssertTrue(open.waitUntilExists(timeout: timeout))
        XCTAssertTrue(open.tap(until: screen.app.staticTexts["profile.workspacesTitle"], timeout: timeout))
    }

    private func workspaceName(_ screen: SignInScreen) -> XCUIElement { screen.app.staticTexts["home.workspaceName"] }

    private func waitForWorkspace(_ name: String, in screen: SignInScreen) -> Bool {
        let element = workspaceName(screen)
        return Polling.until(timeout: timeout, interval: 0.3) { element.exists && element.label == name }
    }

    /// Chooses the workspace of `row` (one of the buttons of *Mijn werkruimtes*) and fails unless the home then shows
    /// `name`. The row is let to come to rest first, and a tap that had no effect is done again: the profile has just
    /// loaded and drawn its rows, and on a slow simulator the press lands while they still settle and the tap is
    /// dropped, the way the row was seen pressed and the screen did not change (#1305; the same as #596 for the buttons
    /// that open a screen). A second choice of the same workspace changes nothing.
    private func switchWorkspace(
        _ row: String, to name: String, in screen: SignInScreen, file: StaticString = #filePath, line: UInt = #line
    ) {
        let button = screen.app.buttons[row]
        XCTAssertTrue(button.waitUntilExists(timeout: timeout), "\(row) is not on screen", file: file, line: line)
        screen.settle(button)
        let shown = screen.app.staticTexts.matching(
            NSPredicate(format: "identifier == 'home.workspaceName' AND label == %@", name)
        ).firstMatch
        XCTAssertTrue(
            button.tap(until: shown, timeout: timeout), "the home did not switch to \(name)", file: file, line: line
        )
    }

    /// The clients on screen, found by the name a row starts with.
    private func clientRow(_ name: String, in app: XCUIApplication) -> XCUIElement {
        app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH 'clients.row.' AND label BEGINSWITH %@", name)
        ).firstMatch
    }

    func test_F012_AC6_profileSwitchesWorkspace() throws {
        let (screen, _) = try launchAsSarah()
        let app = screen.app
        XCTAssertTrue(waitForWorkspace("John's Gym", in: screen), "the first by name when nothing is remembered")
        openProfile(screen)
        XCTAssertTrue(try app.buttons[johns].hasTrait(.selected), "the check is on John's Gym")
        XCTAssertFalse(try app.buttons[own].hasTrait(.selected))
        try assertTouchTarget(app.buttons[own], on: screen)

        switchWorkspace(own, to: "Sarah Personal Training", in: screen)

        // Back on the first tab, whose header shows the workspace, and *Klanten* holds only its clients.
        XCTAssertFalse(app.staticTexts["profile.workspacesTitle"].exists, "the stack is back at the first tab")
        let clients = app.buttons["home.openClients"]
        XCTAssertTrue(clients.waitUntilExists(timeout: timeout))
        XCTAssertTrue(clients.tap(until: clientRow("Eva Visser", in: app), timeout: timeout))
        XCTAssertTrue(clientRow("Daan Mulder", in: app).exists)
        XCTAssertFalse(clientRow("Anna de Vries", in: app).exists, "John's Gym's clients are not shown")

        // The check moved.
        app.navigationBars.buttons.firstMatch.tap()
        openProfile(screen)
        XCTAssertTrue(try app.buttons[own].hasTrait(.selected))
        XCTAssertFalse(try app.buttons[johns].hasTrait(.selected))
    }

    func test_F012_AC6_switchingBackShowsTheFirstWorkspaceClientsAgain() throws {
        let (screen, _) = try launchAsSarah()
        let app = screen.app
        openProfile(screen)
        switchWorkspace(own, to: "Sarah Personal Training", in: screen)
        openProfile(screen)

        switchWorkspace(johns, to: "John's Gym", in: screen)

        XCTAssertTrue(app.buttons["home.openClients"].tap(until: clientRow("Anna de Vries", in: app), timeout: timeout))
        XCTAssertFalse(clientRow("Eva Visser", in: app).exists)
    }

    func test_F012_AC6_oneWorkspaceHasNoCheckAndNoAction() throws {
        let server = try StubServer(
            .greeting(key: "hello.title"),
            signIn: StubServer.SignIn(email: "trainer@example.com", workspaceName: "John's Gym", role: "trainer")
        )
        self.server = server
        let screen = SignInScreen.launch(against: server, session: .signedIn)
        openProfile(screen)

        XCTAssertTrue(screen.app.staticTexts["profile.workspaceName.workspace-0"].exists)
        XCTAssertFalse(screen.app.buttons[johns].exists, "no action with one workspace")
        XCTAssertFalse(screen.app.otherElements[johns].exists)
    }

    func test_F012_AC7_appOpensLastWorkspace() throws {
        let (screen, server) = try launchAsSarah()
        openProfile(screen)
        switchWorkspace(own, to: "Sarah Personal Training", in: screen)
        screen.app.terminate()

        let again = SignInScreen.launch(against: server, session: .asLeft)

        XCTAssertTrue(waitForWorkspace("Sarah Personal Training", in: again), "the last one, not the first by name")
    }

    func test_F012_AC7_theLastWorkspaceSurvivesASignOutAndSignIn() throws {
        let (screen, server) = try launchAsSarah()
        openProfile(screen)
        switchWorkspace(own, to: "Sarah Personal Training", in: screen)

        screen.signOut.tap()
        screen.requestCode(for: server.signIn.email)
        screen.type(server.signIn.code, into: screen.code)

        XCTAssertTrue(waitForWorkspace("Sarah Personal Training", in: screen))
    }

    func test_F012_AC5_aRememberedWorkspaceTheTeamLostFallsBackWithoutAnError() throws {
        let (screen, server) = try launchAsSarah()
        openProfile(screen)
        switchWorkspace(own, to: "Sarah Personal Training", in: screen)
        screen.app.terminate()

        server.removeFromTeam(workspace: 1)
        let again = SignInScreen.launch(against: server, session: .asLeft)

        XCTAssertTrue(waitForWorkspace("John's Gym", in: again))
        XCTAssertFalse(again.app.staticTexts["home.noAccess"].exists)
        XCTAssertFalse(again.homeRetry.exists, "no error")
    }

    func test_F012_AC5_noWorkspaceLeftShowsTheNoAccessState() throws {
        let catalog = TestCatalog.configured
        let (screen, server) = try launchAsSarah()
        openProfile(screen)
        switchWorkspace(own, to: "Sarah Personal Training", in: screen)
        screen.app.terminate()

        server.removeFromTeam(workspace: 0)
        server.removeFromTeam(workspace: 1)
        let again = SignInScreen.launch(against: server, session: .asLeft)

        let noAccess = again.app.staticTexts["home.noAccess"]
        XCTAssertTrue(noAccess.waitUntilExists(timeout: timeout))
        XCTAssertEqual(noAccess.label, catalog["noAccess.body"])
    }

    func test_F012_AC10_switchingKeepsTheInterfaceLanguage() throws {
        let catalog = TestCatalog.configured
        let (screen, server) = try launchAsSarah()
        let app = screen.app
        XCTAssertTrue(waitForWorkspace("John's Gym", in: screen))
        let open = app.buttons["home.openProfile"]
        XCTAssertEqual(open.label, catalog["profile.title"])
        XCTAssertTrue(open.tap(until: app.buttons[own], timeout: timeout))

        switchWorkspace(own, to: "Sarah Personal Training", in: screen)

        XCTAssertEqual(open.label, catalog["profile.title"], "the language is personal, not the workspace's")
        XCTAssertEqual(screen.signOut.label, catalog["signOut.label"])
        XCTAssertTrue(server.requests.filter { $0.method == "PATCH" }.isEmpty, "nothing is stored on the server")
    }

    func test_F012_AC11_actionsFollowWorkspaceRole() throws {
        let catalog = TestCatalog.configured
        let (screen, _) = try launchAsSarah()
        let app = screen.app
        openProfile(screen)
        let trainsHereInOwn = app.switches["profile.trainsHere.workspace-1"]
        XCTAssertTrue(trainsHereInOwn.waitUntilExists(timeout: timeout), "Owner of her own workspace")
        XCTAssertFalse(app.switches["profile.trainsHere.workspace-0"].exists, "no Owner-only action in John's Gym")
        XCTAssertEqual(
            app.staticTexts["profile.workspaceRole.workspace-0"].label, catalog["roles.trainer"]
        )
        XCTAssertEqual(app.staticTexts["profile.workspaceRole.workspace-1"].label, catalog["roles.owner"])

        // The new-client action follows the role of the workspace on screen: both roles may manage clients.
        switchWorkspace(own, to: "Sarah Personal Training", in: screen)
        XCTAssertTrue(app.buttons["home.openClients"].tap(until: app.buttons["clients.add"], timeout: timeout))
    }
}

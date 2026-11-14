import FivviDesignTokens
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

        let title = screen.app.staticTexts["profile.workspacesTitle"]
        XCTAssertTrue(open.tap(until: title, timeout: timeout))
        XCTAssertEqual(title.label, catalog["myProfile.workspacesTitle"])
        XCTAssertEqual(screen.app.staticTexts["profile.title"].label, catalog["profile.title"])
        XCTAssertEqual(screen.app.staticTexts["profile.workspaceName.workspace-0"].label, "John's Gym")
        XCTAssertEqual(screen.app.staticTexts["profile.workspaceRole.workspace-0"].label, catalog["roles.trainer"])
        XCTAssertEqual(screen.app.staticTexts["profile.workspaceName.workspace-1"].label, "Sarah Personal Training")
        XCTAssertEqual(screen.app.staticTexts["profile.workspaceRole.workspace-1"].label, catalog["roles.owner"])
        XCTAssertEqual(server.requests(to: "/api/v1/me/workspaces").map(\.authorization), ["Bearer stub-session-token"])
    }

    /// TM-04 (E020 AC15): each workspace has a 36 pt rounded mark in its colour from the tokens (`workspaceColor`, picked
    /// from the ID, decorative, no initials: white text has no 4.5:1 on those colours), then the name, and the role at
    /// the trailing end, on the name's line and in one column for every row.
    func test_E020_AC15_workspaceRowsShowTheColourMarkAndTheRoleAtTheEnd() throws {
        let server = try StubServer(
            .greeting(key: "hello.title"),
            signIn: StubServer.SignIn(
                email: "trainer@example.com", workspaceName: "John's Gym", role: "trainer",
                otherWorkspaces: [.init(name: "Sarah Personal Training", role: "owner")]
            )
        )
        for (mode, style) in [("light", UIUserInterfaceStyle.light), ("dark", .dark)] {
            let screen = SignInScreen(app: AppLaunch.launch(
                against: server, session: .signedIn, appearance: mode
            ))
            let open = screen.app.buttons["home.openProfile"]
            XCTAssertTrue(open.waitUntilExists(timeout: timeout), mode)
            XCTAssertTrue(open.tap(until: screen.app.staticTexts["profile.workspacesTitle"], timeout: timeout), mode)
            var roleEdges: [CGFloat] = []
            for index in 0...1 {
                let slug = "workspace-\(index)"
                let row = screen.app.buttons["profile.workspace.\(slug)"]
                let name = screen.app.staticTexts["profile.workspaceName.\(slug)"]
                let role = screen.app.staticTexts["profile.workspaceRole.\(slug)"]
                XCTAssertTrue(role.waitUntilExists(timeout: timeout), "\(slug), \(mode)")
                screen.settle(role)

                let mark = CGRect(x: row.frame.minX + 16, y: row.frame.midY - 18, width: 36, height: 36)
                let colours = try ScreenColours(screen.app)
                let colour = RGB(Tokens.workspaceColor(for: Responder.workspaceID(index)), in: style)
                let centre = colours.colour(at: CGPoint(x: mark.midX, y: mark.midY))
                XCTAssertLessThanOrEqual(
                    centre.distance(to: colour), 6, "the mark's colour, \(slug), \(mode): \(centre)"
                )
                let leftEdge = colours.colour(at: CGPoint(x: mark.minX + 2, y: mark.midY))
                XCTAssertLessThanOrEqual(leftEdge.distance(to: colour), 6, "36 pt wide, \(slug), \(mode)")
                let topEdge = colours.colour(at: CGPoint(x: mark.midX, y: mark.minY + 2))
                XCTAssertLessThanOrEqual(topEdge.distance(to: colour), 6, "36 pt high, \(slug), \(mode)")
                let outside = colours.colour(at: CGPoint(x: mark.maxX + 3, y: mark.midY))
                XCTAssertGreaterThan(outside.distance(to: colour), 20, "no wider than 36 pt, \(slug), \(mode)")
                let corner = colours.colour(at: CGPoint(x: mark.minX + 1, y: mark.minY + 1))
                XCTAssertGreaterThan(corner.distance(to: colour), 20, "rounded corners, \(slug), \(mode)")

                XCTAssertLessThanOrEqual(mark.maxX, name.frame.minX, "the name follows the mark, \(slug), \(mode)")
                XCTAssertLessThanOrEqual(name.frame.maxX, role.frame.minX, "the role is after the name, \(slug)")
                XCTAssertEqual(role.frame.midY, name.frame.midY, accuracy: 3, "same line, \(slug), \(mode)")
                XCTAssertLessThanOrEqual(role.frame.maxX, row.frame.maxX - 16, "inside the row's padding, \(slug)")
                roleEdges.append(role.frame.maxX)
            }
            XCTAssertEqual(roleEdges[0], roleEdges[1], accuracy: 1, "the roles end in one column, \(mode)")
            XCTAssertLessThanOrEqual(roleEdges[0], screen.app.windows.firstMatch.frame.maxX - 16 - 20 - 16,
                                     "room is kept for the check of the current workspace, \(mode)")
            screen.app.terminate()
        }
    }

    func test_F003_AC9_aFailedListShowsTheErrorAndRetryRecovers() throws {
        let catalog = TestCatalog.configured
        let (screen, server) = try launchAsSarah()
        server.setOffline(true)
        let open = screen.app.buttons["home.openProfile"]
        XCTAssertTrue(open.waitUntilExists(timeout: timeout))

        let error = screen.app.staticTexts["profile.error"]
        XCTAssertTrue(open.tap(until: error, timeout: timeout))
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

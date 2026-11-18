import XCTest

/// Going back from the *Klantprofiel* (F006, IA §5.2: edge swipe and a back button with the previous title), in nl and
/// en.
@MainActor
final class ClientProfileBackUITests: SignInUITestCase {
    private func row(_ name: String) -> XCUIElement {
        XCUIApplication().buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH 'clients.row.' AND label BEGINSWITH %@", name)
        ).firstMatch
    }

    private var profileName: XCUIElement { XCUIApplication().staticTexts["clientProfile.name"] }

    /// The list itself (the id Maestro looks for); not there while the profile covers it.
    private var list: XCUIElement { XCUIApplication().descendants(matching: .any)["clients.list"] }

    /// Taps the row and waits for the profile; when a busy simulator dropped the tap (the app took 60 s to go idle
    /// before the last row tap of run 43387686310, and the profile never came, #1377), taps it once more
    /// (`tap(until:timeout:)`, reported as a flaky tap). The tap repeats only after the whole wait and only while the
    /// row is still on show, so the profile is never opened twice.
    private func openProfile(of client: String, _ step: String) {
        XCTAssertTrue(
            row(client).tap(until: profileName, timeout: timeout),
            "\(step): the tap on the row of \(client) opens the profile"
        )
    }

    /// Waits until the profile has gone and the list shows `client` again, a pop that is over: the row alone is there
    /// while the swipe or the button is still moving the profile out, and the next tap needs the settled list.
    private func waitForTheList(showing client: String, _ step: String) {
        XCTAssertTrue(
            Polling.until(timeout: timeout) { !profileName.exists && row(client).exists },
            "\(step): the profile goes and the list shows \(client)"
        )
    }

    /// IA §5.2: edge swipe and a back button with the previous title. The system's own back button carries
    /// `clientProfile.back`; going back either way leaves the list usable, and the profile opens again (UIKit's
    /// swipe-back recogniser must not be left in a state that locks the navigation).
    func test_F006_AC12_backByTheEdgeSwipeAndByTheButtonThenOpenTheProfileAgain() throws {
        let catalog = TestCatalog.configured
        let server = try StubServer(
            .greeting(key: "hello.title"),
            signIn: StubServer.SignIn(email: "trainer@example.com", workspaceName: "John's Gym", role: "trainer")
        )
        let screen = SignInScreen.launch(against: server, session: .signedIn)
        let app = screen.app
        let open = app.buttons["home.openClients"]
        XCTAssertTrue(open.waitUntilExists(timeout: timeout), "Home: the Klanten button is there")
        XCTAssertTrue(
            open.tap(until: row("Mark Jansen"), timeout: timeout), "Home: the Klanten button opens the list"
        )

        for round in 1...2 {
            openProfile(of: "Mark Jansen", "round \(round), before the swipe")
            // The title and the back button of the navigation bar come with the push, a moment after the screen's own
            // text on a slow simulator (#596): wait for the button, as for any other element.
            let back = app.buttons["clientProfile.back"]
            XCTAssertTrue(
                back.waitUntilExists(timeout: timeout),
                "round \(round): the system's back button has the id Maestro looks for"
            )
            XCTAssertEqual(back.label, catalog["clients.title"], "and the title of the screen before")

            // The swipe from the left edge.
            let edge = app.coordinate(withNormalizedOffset: CGVector(dx: 0.0, dy: 0.5))
            edge.press(forDuration: 0.1, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)))
            waitForTheList(showing: "Mark Jansen", "round \(round), the swipe goes back")

            openProfile(of: "Anna de Vries", "round \(round), before the button")
            XCTAssertTrue(
                app.buttons["clientProfile.back"].tap(until: list, timeout: timeout),
                "round \(round), the button goes back"
            )
            waitForTheList(showing: "Anna de Vries", "round \(round), the button goes back")
        }

        // Back on Home, a swipe at its edge does nothing, and the list opens again.
        XCTAssertTrue(
            app.navigationBars.buttons.firstMatch.tap(until: app.buttons["home.openClients"], timeout: timeout),
            "Home: the back button of the list goes home"
        )
        let edge = app.coordinate(withNormalizedOffset: CGVector(dx: 0.0, dy: 0.5))
        edge.press(forDuration: 0.1, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)))
        XCTAssertTrue(app.buttons["home.openClients"].exists, "Home is still there")
        XCTAssertTrue(
            app.buttons["home.openClients"].tap(until: row("Mark Jansen"), timeout: timeout),
            "Home: the Klanten button opens the list again"
        )
        openProfile(of: "Mark Jansen", "the last time")
    }
}

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
        XCTAssertTrue(open.waitUntilExists(timeout: timeout))
        open.tap()

        for _ in 1...2 {
            row("Mark Jansen").tap()
            XCTAssertTrue(app.staticTexts["clientProfile.name"].waitUntilExists(timeout: timeout))
            let back = app.buttons["clientProfile.back"]
            XCTAssertTrue(back.exists, "the system's back button has the id Maestro looks for")
            XCTAssertEqual(back.label, catalog["clients.title"], "and the title of the screen before")

            // The swipe from the left edge.
            let edge = app.coordinate(withNormalizedOffset: CGVector(dx: 0.0, dy: 0.5))
            edge.press(forDuration: 0.1, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)))
            XCTAssertTrue(row("Mark Jansen").waitUntilExists(timeout: timeout), "the swipe goes back")
            XCTAssertFalse(app.staticTexts["clientProfile.name"].exists)

            row("Anna de Vries").tap()
            XCTAssertTrue(app.staticTexts["clientProfile.name"].waitUntilExists(timeout: timeout))
            app.buttons["clientProfile.back"].tap()
            XCTAssertTrue(row("Anna de Vries").waitUntilExists(timeout: timeout), "the button goes back")
            XCTAssertFalse(app.staticTexts["clientProfile.name"].exists)
        }

        // Back on Home, a swipe at its edge does nothing, and the list opens again.
        app.navigationBars.buttons.firstMatch.tap()
        XCTAssertTrue(app.buttons["home.openClients"].waitUntilExists(timeout: timeout))
        let edge = app.coordinate(withNormalizedOffset: CGVector(dx: 0.0, dy: 0.5))
        edge.press(forDuration: 0.1, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)))
        XCTAssertTrue(app.buttons["home.openClients"].exists, "Home is still there")
        app.buttons["home.openClients"].tap()
        XCTAssertTrue(row("Mark Jansen").waitUntilExists(timeout: timeout))
        row("Mark Jansen").tap()
        XCTAssertTrue(app.staticTexts["clientProfile.name"].waitUntilExists(timeout: timeout))
    }
}

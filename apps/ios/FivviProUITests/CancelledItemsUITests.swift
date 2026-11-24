import XCTest

/// A cancelled session stays on Vandaag and Agenda, struck through, and TD-02 shows the cancelled line (F026 AC3, iOS), in
/// nl and en, against the stub server: Sarah's Tuesday 22 September 2026 at 08:35 (the app's clock is fixed with
/// `-UITestNow`), the owner of Sarah Personal Training (synthetic). She cancels Anna's session from TD-02 and goes back.
@MainActor
final class CancelledItemsUITests: SignInUITestCase {
    private var catalog: TestCatalog { TestCatalog.configured }
    private var server: StubServer?

    private var log: String { (server?.requests.map { "\($0.method) \($0.path)" } ?? []).joined(separator: "\n") }

    private func launch() throws -> (XCUIApplication, StubServer) {
        let server = try StubServer(signIn: StubServer.SignIn(
            email: "trainer@example.com", workspaceName: "John's Gym", role: "trainer",
            otherWorkspaces: [.init(name: "Sarah Personal Training", role: "owner")], name: "Sarah Visser"
        ))
        server.personalDay = .sarah
        self.server = server
        let app = AppLaunch.launch(
            against: server, session: .signedIn, startTab: nil, now: "2026-09-22T08:35:00+02:00"
        )
        return (app, server)
    }

    func test_F026_AC3_cancelledSessionStruckThrough() throws {
        let (app, server) = try launch()
        let open = app.buttons["today.next.open"]
        XCTAssertTrue(open.waitUntilExists(timeout: timeout), log)
        open.tap()

        // TD-02: Sarah cancels with Wij; the screen shows the cancelled line "Geannuleerd op … door Sarah Visser".
        let menu = app.buttons["session.menu"]
        XCTAssertTrue(menu.waitUntilExists(timeout: timeout), log)
        menu.tap()
        app.buttons["session.cancel"].tap()
        XCTAssertTrue(app.buttons["cancel.who.workspace"].waitUntilExists(timeout: timeout), log)
        app.buttons["cancel.who.workspace"].tap()
        app.buttons["cancel.submit"].tap()
        let banner = app.staticTexts["session.cancelled"]
        XCTAssertTrue(banner.waitUntilExists(timeout: timeout), log)
        XCTAssertTrue(banner.label.contains("Sarah Visser"), banner.label)
        XCTAssertEqual(server.cancelledSessions.first?["sessionId"], StubPersonalRoutes.anna)

        // Vandaag: the session stays, struck through with *Geannuleerd*, and is no longer the next one.
        app.navigationBars.buttons.element(boundBy: 0).tap()
        XCTAssertTrue(app.staticTexts["today.title"].waitUntilExists(timeout: timeout))
        XCUIDevice.shared.press(.home)
        _ = app.wait(for: .runningBackground, timeout: timeout)
        app.activate()
        let row = app.buttons["today.row.\(StubPersonalRoutes.anna)"]
        XCTAssertTrue(row.waitUntilExists(timeout: timeout), log)
        XCTAssertTrue(row.label.contains(catalog["myDay.cancelled"]), row.label)

        // Agenda: the same session in the week, marked *Geannuleerd*.
        app.tabBars.buttons["tab.calendar"].tap()
        let entry = app.buttons["calendar.row.\(StubPersonalRoutes.anna)"]
        XCTAssertTrue(entry.waitUntilExists(timeout: timeout), log)
        XCTAssertTrue(entry.label.contains(catalog["myDay.cancelled"]), entry.label)
    }
}

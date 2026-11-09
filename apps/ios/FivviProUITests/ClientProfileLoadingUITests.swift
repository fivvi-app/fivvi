import XCTest

/// The *Klantprofiel* opened by ID while it loads (F006 AC3, #684), in nl and en. The stub server holds the read of the
/// client, so the profile stays in its loading state; the app counts how often the list behind it renders
/// (`RenderProbe`, shown in `uitest.renders`).
@MainActor
final class ClientProfileLoadingUITests: SignInUITestCase {
    /// *Anna de Vries openen* on a duplicate email address opens the profile by ID, which starts in the loading state.
    /// While it waits for its read the list behind it renders a few times, not without end.
    func test_F006_AC3_aProfileOpenedByIDWhileItLoadsRendersTheListABoundedNumberOfTimes() throws {
        let server = try StubServer(
            .greeting(key: "hello.title"),
            signIn: StubServer.SignIn(email: "trainer@example.com", workspaceName: "John's Gym", role: "trainer")
        )
        let screen = SignInScreen.launch(against: server, session: .signedIn, countsRenders: true)
        let app = screen.app
        let open = app.buttons["home.openClients"]
        XCTAssertTrue(open.waitUntilExists(timeout: timeout))
        XCTAssertTrue(open.tap(until: app.descendants(matching: .any)["clients.list"], timeout: timeout))
        app.buttons["clients.add"].tap()
        XCTAssertTrue(app.textFields["clients.add.name"].waitUntilExists(timeout: timeout))
        screen.type("Anna de Vries-Smit", into: app.textFields["clients.add.name"])
        screen.type("ANNA@example.com", into: app.textFields["clients.add.email"])
        app.buttons["clients.add.submit"].tap()
        XCTAssertTrue(app.buttons["clients.add.openExisting"].waitUntilExists(timeout: timeout))

        server.holdClientReads(true)
        app.buttons["clients.add.openExisting"].tap()
        let loading = app.descendants(matching: .any)["clientProfile.loading"]
        XCTAssertTrue(loading.waitUntilExists(timeout: timeout), "the profile waits for its read")

        // Let the screen settle (the count stays the same for a second), then watch it for three seconds: the list
        // renders no more than twice more. Both are waits on a condition, never a sleep (`TESTING.md §1.6`).
        let renders = { (view: String) -> Int in
            let line = app.descendants(matching: .any)["uitest.renders"].label
            return line.split(separator: " ").compactMap { part -> Int? in
                let pair = part.split(separator: "=")
                return pair.count == 2 && pair[0] == view ? Int(pair[1]) : nil
            }.first ?? 0
        }
        var last = renders("ClientsView")
        var since = Date()
        let hasSettled = Polling.until(timeout: 10) {
            let count = renders("ClientsView")
            if count != last {
                last = count
                since = Date()
            }
            return Date().timeIntervalSince(since) >= 1
        }
        XCTAssertTrue(hasSettled, "the list stops rendering while the profile loads: no layout loop")
        let settled = renders("ClientsView")
        let rendersAgain = Polling.until(timeout: 3) { renders("ClientsView") > settled + 2 }
        XCTAssertFalse(rendersAgain, "and stays quiet: no layout loop")
        XCTAssertTrue(loading.exists, "still waiting")
        XCTAssertLessThan(settled, 50, "the list renders a few times while the profile loads")

        server.holdClientReads(false)
        XCTAssertTrue(app.staticTexts["clientProfile.name"].waitUntilExists(timeout: timeout))
        XCTAssertEqual(app.staticTexts["clientProfile.name"].label, "Anna de Vries")
    }
}

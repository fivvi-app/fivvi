import XCTest

/// What the private session UI tests share (F020): the stub server with John's Gym's clients and one session, Anna's
/// tomorrow at 09:00 (synthetic), and the steps that open PS-04 and TD-02.
@MainActor
class PrivateSessionUITestCase: SignInUITestCase {
    var catalog: TestCatalog { TestCatalog.configured }
    /// The server of the test's launch, for the messages of a failed wait.
    var server: StubServer?

    /// Sarah (synthetic): a Trainer of John's Gym, or John, its Owner.
    func launch(
        owner: Bool = false, recordsLinks: Bool = false, opensClassDate: String? = nil, now: String? = nil,
        offline: Bool = false, seededLevel: String? = nil
    ) throws -> (SignInScreen, StubServer) {
        let server = try StubServer(
            signIn: StubServer.SignIn(
                email: owner ? "owner@example.com" : "trainer@example.com", workspaceName: "John's Gym",
                role: owner ? "owner" : "trainer", name: owner ? "John Smit" : "Sarah Visser"
            )
        )
        self.server = server
        if let seededLevel { server.setSeededClassLevel(seededLevel) }
        return (
            SignInScreen.launch(
                against: server, session: .signedIn, recordsOpenedLinks: recordsLinks, opensClassDate: opensClassDate,
                now: now, connectivity: offline ? "offline" : nil
            ),
            server
        )
    }

    func any(_ id: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)[id].firstMatch
    }

    /// **+** → *Privésessie*: PS-04 is open once its title shows.
    func openNewSession(_ app: XCUIApplication) {
        let plus = app.buttons["home.new"]
        XCTAssertTrue(plus.waitUntilExists(timeout: timeout))
        plus.tap()
        let item = app.buttons["home.newPrivateSession"]
        XCTAssertTrue(item.waitUntilExists(timeout: timeout))
        item.tap()
        XCTAssertTrue(app.staticTexts["newSession.title"].waitUntilExists(timeout: timeout))
    }

    /// What the app asked the stub server so far, for the message of a failed wait.
    var requestLog: String {
        (server?.requests.map { "\($0.method) \($0.path)" } ?? []).joined(separator: "\n")
    }

    /// Chooses Anna de Vries in the client list of PS-04.
    func chooseAnna(_ app: XCUIApplication) {
        let row = any("newSession.client", in: app)
        XCTAssertTrue(row.waitUntilExists(timeout: timeout), requestLog)
        row.tap()
        let search = app.searchFields["clientPicker.search"]
        XCTAssertTrue(search.waitUntilExists(timeout: timeout))
        search.enter("Anna")
        let anna = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH 'clientPicker.row.' AND label BEGINSWITH 'Anna'")
        ).firstMatch
        XCTAssertTrue(anna.waitUntilExists(timeout: timeout))
        anna.tap()
        XCTAssertTrue(app.staticTexts["newSession.clientName"].waitUntilExists(timeout: timeout))
    }

    /// The seeded session, opened from Anna's profile: *Klanten* → Anna → *Komende sessies* → its row.
    func openSeededSession(_ app: XCUIApplication) {
        let open = app.buttons["home.openClients"]
        XCTAssertTrue(open.waitUntilExists(timeout: timeout), "Home shows the Klanten button")
        let anna = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH 'clients.row.' AND label BEGINSWITH 'Anna'")
        ).firstMatch
        XCTAssertTrue(open.tap(until: anna, timeout: timeout), "the client list shows Anna: \(requestLog)")
        // Each tap that opens a screen is repeated once when a slow simulator dropped it (#596, #1596: the tap on the
        // session row was dropped, and the wait for the session screen ended the nightly run).
        let row = any("clientProfile.upcoming.\(StubSessionRoutes.seededSessionID)", in: app)
        XCTAssertTrue(anna.tap(until: row, timeout: timeout), "Anna's profile lists the seeded session: \(requestLog)")
        let title = app.staticTexts["session.title"]
        XCTAssertTrue(row.tap(until: title, timeout: timeout), "the session row opens the session: \(requestLog)")
    }

    func nextFullHour() -> (date: String, time: String) {
        let calendar = Calendar.gregorianAmsterdam
        let now = Date()
        let hour = calendar.dateInterval(of: .hour, for: now)?.start ?? now
        let next = calendar.date(byAdding: .hour, value: 1, to: hour) ?? now
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        let date = formatter.string(from: next)
        formatter.dateFormat = "HH:mm"
        return (date, formatter.string(from: next))
    }
}

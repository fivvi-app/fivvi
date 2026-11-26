import XCTest

/// What the attendance UI tests share (F025): the stub server with "Kracht" tomorrow at 18:00 and its seven participants, John
/// (the Owner) or Sarah (a Trainer) signed in, and the steps that open TD-03 and CO-05 (synthetic names).
@MainActor
class AttendanceUITestCase: PrivateSessionUITestCase {
    let krachtID = StubSessionRoutes.seededClassDateID

    func participantID(_ name: String) -> String {
        StubSessionRoutes.participantID(StubSessionRoutes.krachtNames.firstIndex(of: name) ?? 0)
    }

    /// Launches the app on TD-03 of "Kracht" with its seven participants, *Geboekt* but for `statuses` (by first name).
    func launchKracht(
        statuses: [String: String] = [:], owner: Bool = true, offline: Bool = false,
        server existing: StubServer? = nil, session: AppLaunch.Session = .signedIn
    ) throws -> (XCUIApplication, StubServer) {
        let server = try existing ?? StubServer(signIn: StubServer.SignIn(
            email: owner ? "owner@example.com" : "trainer@example.com", workspaceName: "John's Gym",
            role: owner ? "owner" : "trainer", name: owner ? "John Smit" : "Sarah Visser"
        ))
        self.server = server
        if existing == nil { server.seedKrachtParticipants(statuses) }
        let app = AppLaunch.launch(
            against: server, session: session, opensClassDate: krachtID, connectivity: offline ? "offline" : nil
        )
        return (app, server)
    }

    /// TD-03 → *Aanwezigheid invullen* → CO-05.
    func openAttendance(_ app: XCUIApplication) {
        let button = app.buttons["classDate.takeAttendance"]
        XCTAssertTrue(button.waitUntilExists(timeout: timeout), requestLog)
        XCTAssertTrue(button.tap(until: app.staticTexts["attendance.title"], timeout: timeout), requestLog)
    }

    func summaryLabel(_ attended: Int, _ noShow: Int, _ open: Int) -> String {
        String(format: catalog["attendance.summary"], String(attended), String(noShow), String(open))
    }

    /// Waits until the app has sent `count` attendance requests.
    func waitForRequests(
        _ server: StubServer, _ count: Int, file: StaticString = #filePath, line: UInt = #line
    ) {
        XCTAssertTrue(
            Polling.until(timeout: timeout, interval: 0.2) { server.attendanceRequests.count == count },
            "the app sent \(server.attendanceRequests.count) requests, not \(count): \(requestLog)",
            file: file, line: line
        )
    }

    func waitForSummary(
        _ app: XCUIApplication, _ expected: String, file: StaticString = #filePath, line: UInt = #line
    ) {
        let summary = any("attendance.summary", in: app)
        XCTAssertTrue(
            Polling.until(timeout: timeout, interval: 0.2) { summary.exists && summary.label == expected },
            "the summary reads \(summary.exists ? summary.label : "nothing"), not \(expected): \(requestLog)",
            file: file, line: line
        )
    }

    func tapAttended(_ name: String, _ app: XCUIApplication) {
        let button = app.buttons["attendance.attended.\(participantID(name))"]
        XCTAssertTrue(button.waitUntilExists(timeout: timeout), requestLog)
        button.tap()
    }

    func tapNoShow(_ name: String, _ app: XCUIApplication) {
        let button = app.buttons["attendance.noShow.\(participantID(name))"]
        XCTAssertTrue(button.waitUntilExists(timeout: timeout), requestLog)
        button.tap()
    }

    func line(_ name: String, _ app: XCUIApplication) -> XCUIElement {
        any("attendance.line.\(participantID(name))", in: app)
    }

    /// Stops the app, as a person closing it.
    func close(_ app: XCUIApplication) {
        AppLifecycle.stop(app)
    }

    /// The time of day of an instant in Amsterdam, as the screens write it.
    func time(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "Europe/Amsterdam")
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: date)
    }
}

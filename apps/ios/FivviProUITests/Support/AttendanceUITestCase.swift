import XCTest

/// What the attendance UI tests share (F025): the stub server with "Kracht" tomorrow at 18:00 and its seven participants, John
/// (the Owner) or Sarah (a Trainer) signed in, the steps that open TD-03 and CO-05, and Vandaag with Anna's session or the class
/// ended (synthetic names).
@MainActor
class AttendanceUITestCase: PrivateSessionUITestCase {
    let krachtID = StubSessionRoutes.seededClassDateID

    func participantID(_ name: String) -> String {
        StubSessionRoutes.participantID(StubSessionRoutes.krachtNames.firstIndex(of: name) ?? 0)
    }

    /// Launches the app on TD-03 of "Kracht" with its seven participants, *Geboekt* but for `statuses` (by first name).
    func launchKracht(
        statuses: [String: String] = [:], owner: Bool = true, offline: Bool = false,
        server existing: StubServer? = nil, session: AppLaunch.Session = .signedIn, textSize: String? = nil
    ) throws -> (XCUIApplication, StubServer) {
        let server = try existing ?? StubServer(signIn: StubServer.SignIn(
            email: owner ? "owner@example.com" : "trainer@example.com", workspaceName: "John's Gym",
            role: owner ? "owner" : "trainer", name: owner ? "John Smit" : "Sarah Visser"
        ))
        self.server = server
        if existing == nil { server.seedKrachtParticipants(statuses) }
        let app = AppLaunch.launch(
            against: server, session: session, textSize: textSize, opensClassDate: krachtID,
            connectivity: offline ? "offline" : nil
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

    /// A participant's row of CO-05: one element for VoiceOver, "Anna de Vries, aanwezig", with the two buttons as its
    /// custom actions; the buttons are drawn but not elements of their own.
    func row(_ name: String, _ app: XCUIApplication) -> XCUIElement {
        any("attendance.row.\(participantID(name))", in: app)
    }

    /// What a row reads for VoiceOver: "{name}, {status}" and, after it, a line (*Wacht op verbinding* or a message).
    func rowLabel(_ name: String, _ status: String, line: String? = nil) -> String {
        let base = String(
            format: catalog["attendance.app.rowLabel"], name, catalog["attendance.status.\(status)"].lowercased()
        )
        return line.map { String(format: catalog["myDay.spokenJoin"], base, $0) } ?? base
    }

    func waitForRow(
        _ name: String, _ app: XCUIApplication, _ expected: String, file: StaticString = #filePath, line: UInt = #line
    ) {
        let row = row(name, app)
        XCTAssertTrue(
            Polling.until(timeout: timeout, interval: 0.2) { row.exists && row.label == expected },
            "the row of \(name) reads \(row.exists ? row.label : "nothing"), not \(expected): \(requestLog)",
            file: file, line: line
        )
    }

    /// The size of a row's round buttons at the text size `stacked` stands for: 44 pt at the standard size, scaled with
    /// the body text like the app's `@ScaledMetric(relativeTo: .body)`.
    private func markSize(stacked: Bool) -> CGFloat {
        guard stacked else { return 44 }
        let category = UIContentSizeCategory(rawValue: AppLaunch.largestTextSize)
        return UIFontMetrics(forTextStyle: .body).scaledValue(
            for: 44, compatibleWith: UITraitCollection(preferredContentSizeCategory: category)
        )
    }

    /// Taps one of a row's two buttons where they are drawn (the row is the only element): at the trailing side, or under
    /// the name at the accessibility text sizes (the buttons as large as `markSize`, 8 pt apart, 16 pt and 11 pt inside the
    /// row).
    private func tapButton(_ name: String, noShow: Bool, _ app: XCUIApplication, stacked: Bool) {
        let row = row(name, app)
        XCTAssertTrue(row.waitUntilExists(timeout: timeout), requestLog)
        let frame = row.frame
        let size = markSize(stacked: stacked)
        let step: CGFloat = noShow ? size + 8 : 0
        let offset = stacked
            ? CGVector(dx: 16 + size / 2 + step, dy: frame.height - 11 - size / 2)
            : CGVector(dx: frame.width - 16 - size / 2 - (size + 8) + step, dy: frame.height / 2)
        row.coordinate(withNormalizedOffset: .zero).withOffset(offset).tap()
    }

    func tapAttended(_ name: String, _ app: XCUIApplication, stacked: Bool = false) {
        tapButton(name, noShow: false, app, stacked: stacked)
    }

    func tapNoShow(_ name: String, _ app: XCUIApplication, stacked: Bool = false) {
        tapButton(name, noShow: true, app, stacked: stacked)
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

    let anna = StubPersonalRoutes.anna
    let kracht = StubPersonalRoutes.kracht

    /// Vandaag at `now` for Sarah (a Trainer on two teams), or for John, the Owner of a team.
    func launchToday(
        ended: Bool, classEnded: Bool = false, owner: Bool = false, now: String = "2026-09-22T10:05:00+02:00",
        offline: Bool = false, textSize: String? = nil
    ) throws -> (XCUIApplication, StubServer) {
        let server = try StubServer(signIn: StubServer.SignIn(
            email: owner ? "john@example.com" : "trainer@example.com", workspaceName: "John's Gym",
            role: owner ? "owner" : "trainer",
            otherWorkspaces: owner ? [] : [.init(name: "Sarah Personal Training", role: "owner")],
            name: owner ? "John Visser" : "Sarah Visser", hasTeam: owner
        ))
        self.server = server
        server.setAttendanceOpens(anna, at: StubSessionRoutes.date("2026-09-22", "08:30") ?? Date())
        if ended { server.setEnded(anna) }
        if classEnded {
            server.seedKrachtParticipants()
            server.setAttendanceOpens(kracht, at: StubSessionRoutes.date("2026-09-22", "08:30") ?? Date())
            server.setEnded(kracht)
        }
        return (
            AppLaunch.launch(
                against: server, session: .signedIn, textSize: textSize, startTab: nil, now: now,
                connectivity: offline ? "offline" : nil
            ),
            server
        )
    }
}

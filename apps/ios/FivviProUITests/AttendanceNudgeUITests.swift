import XCTest

/// The nudge on TD-01 *Vandaag*, its *Mijn dag* card's *Te doen* row, and attendance on the Owner's *Hele studio* (F025 AC2,
/// AC7 and the design, iOS), in nl and en, against the stub server: Tuesday 22 September 2026 at 10:05 (the app's clock is
/// fixed with `-UITestNow`), Anna's 09:00 session still *Geboekt* once the test says it has ended (synthetic).
@MainActor
final class AttendanceNudgeUITests: AttendanceUITestCase {
    private let anna = StubPersonalRoutes.anna

    /// Vandaag at `now` for Sarah (a Trainer on two teams), or for John, the Owner of a team.
    private func launchToday(
        ended: Bool, owner: Bool = false, now: String = "2026-09-22T10:05:00+02:00"
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
        return (AppLaunch.launch(against: server, session: .signedIn, startTab: nil, now: now), server)
    }

    func test_F025_AC2_atTenPastTenTheNudgeShowsAndNoShowSetsNoShowAndClearsIt() throws {
        let (app, server) = try launchToday(ended: true)
        let nudge = any("today.nudge.\(anna)", in: app)
        XCTAssertTrue(nudge.waitUntilExists(timeout: timeout), requestLog)
        XCTAssertEqual(nudge.label, catalog["attendance.nudge"])
        let attended = app.buttons["today.nudge.attended.\(anna)"]
        XCTAssertEqual(
            attended.label,
            String(
                format: catalog["attendance.nudgeButtonLabel"], "Anna de Vries", catalog["attendance.status.attended"]
            )
        )
        let noShow = app.buttons["today.nudge.noShow.\(anna)"]
        XCTAssertTrue(noShow.exists)
        XCTAssertEqual(
            noShow.label,
            String(format: catalog["attendance.nudgeButtonLabel"], "Anna de Vries", catalog["attendance.status.noShow"])
        )

        noShow.tap()
        XCTAssertTrue(Polling.until(timeout: timeout, interval: 0.2) { !nudge.exists }, "the nudge goes: \(requestLog)")
        waitForRequests(server, 1)
        let sent = try XCTUnwrap(server.attendanceRequests.first)
        XCTAssertEqual(sent["status"], "no_show")
        XCTAssertEqual(sent["clientId"], StubSessionRoutes.annaID)
        XCTAssertEqual(sent["surface"], "ios")
    }

    func test_F025_AC2_duringTheSessionThereIsNoNudge() throws {
        let (app, _) = try launchToday(ended: false, now: "2026-09-22T09:50:00+02:00")
        XCTAssertTrue(app.staticTexts["today.title"].waitUntilExists(timeout: timeout), requestLog)
        XCTAssertTrue(any("today.card", in: app).waitUntilExists(timeout: timeout), requestLog)
        XCTAssertFalse(any("today.nudge.\(anna)", in: app).exists, "no nudge at 09:50")
        XCTAssertEqual(any("today.card.todo", in: app).label, catalog["attendance.app.caughtUp"])
    }

    func test_F025_Design_theTeDoenChipOpensTD02AndOnceMarkedTheCardSaysAllCaughtUp() throws {
        let (app, server) = try launchToday(ended: true)
        let todo = any("today.card.todo", in: app)
        XCTAssertTrue(todo.waitUntilExists(timeout: timeout), requestLog)
        XCTAssertEqual(todo.label, catalog["attendance.app.todo"])
        let chip = app.buttons["today.card.todo.\(anna)"]
        XCTAssertTrue(chip.waitUntilExists(timeout: timeout), requestLog)
        XCTAssertEqual(chip.label, String(format: catalog["attendance.app.chip"], "Anna", "09:00"))

        XCTAssertTrue(chip.tap(until: app.staticTexts["session.title"], timeout: timeout), requestLog)
        let control = app.segmentedControls["session.attendance.\(StubSessionRoutes.annaID)"]
        XCTAssertTrue(control.waitUntilExists(timeout: timeout), requestLog)
        control.buttons[catalog["attendance.status.attended"]].tap()
        waitForRequests(server, 1)

        let back = app.navigationBars.buttons.firstMatch
        XCTAssertTrue(back.tap(until: todo, timeout: timeout), requestLog)
        XCTAssertTrue(
            Polling.until(timeout: timeout, interval: 0.2) { todo.label == self.catalog["attendance.app.caughtUp"] },
            "once marked, the card says all caught up: \(todo.label)"
        )
        XCTAssertFalse(app.buttons["today.card.todo.\(anna)"].exists)
    }

    func test_F025_AC7_johnTakesAttendanceFromTheWorkspaceDay() throws {
        let (app, server) = try launchToday(ended: true, owner: true)
        let control = app.segmentedControls["today.scope"]
        XCTAssertTrue(control.waitUntilExists(timeout: timeout), requestLog)
        control.buttons[catalog["myDay.app.scopeStudio"]].tap()

        let nudge = any("today.nudge.\(anna)", in: app)
        XCTAssertTrue(nudge.waitUntilExists(timeout: timeout), requestLog)
        app.buttons["today.nudge.attended.\(anna)"].tap()
        XCTAssertTrue(Polling.until(timeout: timeout, interval: 0.2) { !nudge.exists }, requestLog)
        waitForRequests(server, 1)
        XCTAssertEqual(server.attendanceRequests.first?["status"], "attended")
        XCTAssertEqual(server.attendanceRequests.first?["surface"], "ios")
    }
}

import XCTest

/// The nudge on TD-01 *Vandaag*, the line of an ended class, its *Mijn dag* card's *Te doen* row, and attendance on the Owner's *Hele studio* (F025 AC2, AC7 and the design, iOS), in
/// nl and en, against the stub server: Tuesday 22 September 2026 at 10:05 (the app's clock is fixed with `-UITestNow`),
/// Anna's 09:00 session still *Geboekt* once the test says it has ended (synthetic), and so is "Kracht" with its seven
/// participants.
@MainActor
final class AttendanceNudgeUITests: AttendanceUITestCase {

    func test_F025_AC2_todayNudgeMarksNoShow() throws {
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

    func test_F025_AC8_aTapFromTheNudgeWhileOfflineKeepsTheRowWaitingForTheConnection() throws {
        let (app, server) = try launchToday(ended: true, offline: true)
        XCTAssertTrue(any("today.nudge.\(anna)", in: app).waitUntilExists(timeout: timeout), requestLog)
        app.buttons["today.nudge.attended.\(anna)"].tap()

        let waiting = any("today.nudge.waiting.\(anna)", in: app)
        XCTAssertTrue(waiting.waitUntilExists(timeout: timeout), requestLog)
        XCTAssertEqual(waiting.label, catalog["attendance.app.waiting"])
        XCTAssertFalse(app.buttons["today.nudge.attended.\(anna)"].exists, "the tap is made: no buttons meanwhile")
        XCTAssertFalse(
            Polling.until(timeout: 1.5, interval: 0.2) { !waiting.exists }, "it keeps showing while the tap waits"
        )
        XCTAssertTrue(server.attendanceRequests.isEmpty)

        // The app is closed and opened again, now online: the tap that waited is sent, and the queue is empty again for the
        // next test (the phone's file outlives the app).
        AppLifecycle.stop(app)
        let again = AppLaunch.launch(
            against: server, session: .asLeft, startTab: nil, now: "2026-09-22T10:05:00+02:00"
        )
        waitForRequests(server, 1)
        XCTAssertEqual(server.attendanceRequests.first?["status"], "attended")
        let waitingAgain = any("today.nudge.waiting.\(anna)", in: again)
        XCTAssertTrue(Polling.until(timeout: timeout, interval: 0.2) { !waitingAgain.exists }, requestLog)
    }

    /// The tap is refused as too early (the day still lists the session as waiting, so the row stays): a cancelled session
    /// is refused too, but then the day that is read again no longer lists it, and the nudge is gone (unit test).
    func test_F025_AC9_aTapTheSyncRefusesRevertsTheNudgeWithTheServersMessage() throws {
        let (app, server) = try launchToday(ended: true)
        XCTAssertTrue(any("today.nudge.\(anna)", in: app).waitUntilExists(timeout: timeout), requestLog)
        // The connection is lost: the tap waits. Meanwhile the window closes for this session (as the stub says).
        server.setOffline(true)
        app.buttons["today.nudge.noShow.\(anna)"].tap()
        XCTAssertTrue(any("today.nudge.waiting.\(anna)", in: app).waitUntilExists(timeout: timeout), requestLog)
        let opens = Date().addingTimeInterval(3 * 3600)
        server.setAttendanceOpens(anna, at: opens)
        server.setOffline(false)

        let message = any("today.nudge.message.\(anna)", in: app)
        XCTAssertTrue(message.waitUntilExists(timeout: timeout * 3), "the row reverts with the message: \(requestLog)")
        XCTAssertEqual(message.label, String(format: catalog["attendance.tooEarly"], time(opens)))
        let attended = app.buttons["today.nudge.attended.\(anna)"]
        XCTAssertTrue(attended.waitUntilExists(timeout: timeout), "the buttons are back")
        XCTAssertFalse(any("today.nudge.waiting.\(anna)", in: app).exists)
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

    /// An ended class with open participants has the line alone (the same words, no buttons); a tap on it opens CO-05.
    func test_F025_aClassThatEndedWithOpenParticipantsShowsTheLineAndItOpensCO05() throws {
        let (app, _) = try launchToday(ended: false, classEnded: true)
        let line = any("today.nudge.\(kracht)", in: app)
        XCTAssertTrue(line.waitUntilExists(timeout: timeout), requestLog)
        XCTAssertEqual(line.label, catalog["attendance.nudge"])
        XCTAssertFalse(
            app.buttons["today.nudge.attended.\(kracht)"].exists, "no buttons: the class is filled in on CO-05"
        )
        XCTAssertFalse(any("today.nudge.\(anna)", in: app).exists, "Anna's session has not ended")

        for _ in 0..<6 where !line.isHittable { app.swipeUp() }
        XCTAssertTrue(line.tap(until: app.staticTexts["attendance.title"], timeout: timeout), requestLog)
        waitForSummary(app, summaryLabel(0, 0, 7))
    }

    /// The chip "Aanwezigheid · Anna 09:00" at the largest text size wraps its text and stays within the screen.
    func test_F025_theTeDoenChipAtTheLargestTextSizeStaysWithinTheScreen() throws {
        let (app, _) = try launchToday(ended: true, textSize: AppLaunch.largestTextSize)
        let chip = app.buttons["today.card.todo.\(anna)"]
        XCTAssertTrue(chip.waitUntilExists(timeout: timeout), requestLog)
        let width = app.windows.firstMatch.frame.width
        XCTAssertGreaterThanOrEqual(chip.frame.minX, 0, "the chip starts on screen")
        XCTAssertLessThanOrEqual(chip.frame.maxX, width, "the chip ends on screen: \(chip.frame)")
        XCTAssertGreaterThan(chip.frame.height, 60, "its text wraps onto more lines: \(chip.frame)")
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

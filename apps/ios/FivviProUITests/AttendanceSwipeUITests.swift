import XCTest

/// The swipes of a row of TD-01 *Vandaag* with a nudge (F025 AC2, AC7, iOS), in nl and en, against the stub server on
/// Tuesday 22 September 2026 at 10:05: rightward *Aanwezig* (the leading side), leftward *Niet verschenen* (the trailing
/// side), a vertical swipe that still scrolls, and a scroll that closes the open row.
@MainActor
final class AttendanceSwipeUITests: AttendanceUITestCase {
    /// Swiping a row with a nudge shows its actions behind it, on the side the row was swiped away from.
    private func swipeOpen(
        _ row: XCUIElement, _ app: XCUIApplication, _ action: String, leftward: Bool
    ) -> XCUIElement {
        let button = app.buttons[action]
        XCTAssertTrue(row.waitUntilExists(timeout: timeout), requestLog)
        for _ in 0..<6 where !row.isHittable { app.swipeUp() }
        XCTAssertFalse(button.isHittable, "the actions are behind the row until it is swiped")
        let opened = Polling.acting(
            timeout: timeout, action: { if leftward { row.swipeLeft() } else { row.swipeRight() } },
            canRepeat: { row.exists }, report: { _, _ in }, until: { button.exists && button.isHittable }
        )
        XCTAssertTrue(opened, "the swipe shows the actions: \(requestLog)")
        return button
    }

    private func label(_ status: String) -> String {
        String(format: catalog["attendance.nudgeButtonLabel"], "Anna de Vries", catalog["attendance.status.\(status)"])
    }

    /// A swipe to the left (the trailing side) shows *Niet verschenen* alone, and a tap on it sets no-show.
    func test_F025_AC2_trailingSwipeOnTheRowMarksNoShow() throws {
        let (app, server) = try launchToday(ended: true)
        let nudge = any("today.nudge.\(anna)", in: app)
        XCTAssertTrue(nudge.waitUntilExists(timeout: timeout), requestLog)
        let noShow = swipeOpen(any("today.row.\(anna)", in: app), app, "today.swipe.noShow.\(anna)", leftward: true)
        XCTAssertEqual(noShow.label, label("noShow"))
        XCTAssertFalse(app.buttons["today.swipe.attended.\(anna)"].isHittable, "*Aanwezig* is on the other side")

        noShow.tap()
        XCTAssertTrue(Polling.until(timeout: timeout, interval: 0.2) { !nudge.exists }, "the nudge goes: \(requestLog)")
        waitForRequests(server, 1)
        XCTAssertEqual(server.attendanceRequests.first?["status"], "no_show")
        XCTAssertEqual(server.attendanceRequests.first?["clientId"], StubSessionRoutes.annaID)
    }

    /// A swipe to the right (the leading side) shows *Aanwezig* alone, and a tap on it sets attended.
    func test_F025_AC2_leadingSwipeOnTheRowMarksAttended() throws {
        let (app, server) = try launchToday(ended: true)
        let nudge = any("today.nudge.\(anna)", in: app)
        XCTAssertTrue(nudge.waitUntilExists(timeout: timeout), requestLog)
        let attended = swipeOpen(
            any("today.row.\(anna)", in: app), app, "today.swipe.attended.\(anna)", leftward: false
        )
        XCTAssertEqual(attended.label, label("attended"))
        XCTAssertFalse(app.buttons["today.swipe.noShow.\(anna)"].isHittable, "*Niet verschenen* is on the other side")

        attended.tap()
        XCTAssertTrue(Polling.until(timeout: timeout, interval: 0.2) { !nudge.exists }, "the nudge goes: \(requestLog)")
        waitForRequests(server, 1)
        XCTAssertEqual(server.attendanceRequests.first?["status"], "attended")
        XCTAssertEqual(server.attendanceRequests.first?["clientId"], StubSessionRoutes.annaID)
    }

    func test_F025_AC7_leadingSwipeOnTheWorkspaceDayMarksAttended() throws {
        let (app, server) = try launchToday(ended: true, owner: true)
        let control = app.segmentedControls["today.scope"]
        XCTAssertTrue(control.waitUntilExists(timeout: timeout), requestLog)
        control.buttons[catalog["myDay.app.scopeStudio"]].tap()
        let nudge = any("today.nudge.\(anna)", in: app)
        XCTAssertTrue(nudge.waitUntilExists(timeout: timeout), requestLog)

        swipeOpen(any("today.row.\(anna)", in: app), app, "today.swipe.attended.\(anna)", leftward: false).tap()
        XCTAssertTrue(Polling.until(timeout: timeout, interval: 0.2) { !nudge.exists }, requestLog)
        waitForRequests(server, 1)
        XCTAssertEqual(server.attendanceRequests.first?["status"], "attended")
    }

    /// Drags the finger up (or down) from the part of the row that is on screen: the way a person scrolls, starting on the
    /// row.
    private func scroll(from row: XCUIElement, in app: XCUIApplication, upward: Bool) {
        let window = app.windows.firstMatch
        let height = window.frame.height
        let frame = row.frame
        let top = max(frame.minY, height * 0.1), bottom = min(frame.maxY, height * 0.9)
        let start = window.coordinate(withNormalizedOffset: .zero)
            .withOffset(CGVector(dx: frame.midX, dy: (top + bottom) / 2))
        let end = start.withOffset(CGVector(dx: 0, dy: upward ? -height * 0.15 : height * 0.15))
        // Slowly, and held at the end, so the list does not fling on.
        start.press(forDuration: 0.05, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.5)
    }

    /// A vertical swipe that starts on a row with a nudge scrolls Vandaag (the row's pan leaves it to the scroll view), and
    /// a tap on the row still opens TD-02.
    func test_F025_aVerticalSwipeOnTheNudgeRowScrollsVandaagAndATapStillOpensTD02() throws {
        let (app, _) = try launchToday(ended: true, textSize: AppLaunch.largestTextSize)
        let row = any("today.row.\(anna)", in: app)
        XCTAssertTrue(row.waitUntilExists(timeout: timeout), requestLog)
        for _ in 0..<12 where !row.isHittable { app.swipeUp() }
        XCTAssertTrue(row.isHittable, "the row is on screen")

        // The finger moves toward the middle of the screen, so the row stays on screen as the list moves under it; when the
        // list is at its end, the other way.
        let middle = app.windows.firstMatch.frame.midY
        let before = row.frame
        let towardMiddle = (max(before.minY, 0) + min(before.maxY, middle * 2)) / 2 > middle
        func moved() -> Bool { row.waitUntilExists(timeout: 3) && abs(row.frame.minY - before.minY) > 30 }
        scroll(from: row, in: app, upward: towardMiddle)
        if !moved() {
            XCTAssertTrue(row.waitUntilExists(timeout: timeout), "the row is still there: \(before) \(requestLog)")
            scroll(from: row, in: app, upward: !towardMiddle)
        }
        XCTAssertTrue(moved(), "the list scrolled under the finger: \(before) -> \(row.exists ? row.frame : .zero)")
        XCTAssertFalse(app.buttons["today.swipe.attended.\(anna)"].isHittable, "a vertical swipe opens no actions")
        XCTAssertFalse(app.staticTexts["session.title"].exists, "and opens no screen")

        XCTAssertTrue(row.isHittable, "the row is still on screen")
        XCTAssertTrue(row.tap(until: app.staticTexts["session.title"], timeout: timeout), requestLog)
    }

    /// A scroll closes the row that is open, as the system's swipe actions do.
    func test_F025_aScrollClosesTheRowThatIsOpen() throws {
        let (app, _) = try launchToday(ended: true)
        let row = any("today.row.\(anna)", in: app)
        let attended = swipeOpen(row, app, "today.swipe.attended.\(anna)", leftward: false)
        XCTAssertTrue(attended.isHittable)
        scroll(from: row, in: app, upward: false)
        XCTAssertTrue(
            Polling.until(timeout: timeout, interval: 0.2) { !attended.isHittable }, "the row closed: \(requestLog)"
        )
    }
}

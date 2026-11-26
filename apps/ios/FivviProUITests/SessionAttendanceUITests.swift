import XCTest

/// TD-02's *Aanwezigheid* section (F025 AC1 and the design, iOS), in nl and en, against the stub server: Anna's private session
/// tomorrow at 09:00 with the signed-in trainer (synthetic). The section is a segmented control, *Geboekt | Aanwezig | Niet
/// verschenen*, saving at once.
@MainActor
final class SessionAttendanceUITests: AttendanceUITestCase {
    private var annaControl: String { "session.attendance.\(StubSessionRoutes.annaID)" }

    func test_F025_AC1_markPrivateSessionAttended() throws {
        let (screen, server) = try launch()
        let app = screen.app
        openSeededSession(app)

        let title = any("session.attendance.title", in: app)
        XCTAssertTrue(title.waitUntilExists(timeout: timeout), requestLog)
        XCTAssertEqual(title.label, catalog["attendance.title"])
        let control = app.segmentedControls[annaControl]
        XCTAssertTrue(control.waitUntilExists(timeout: timeout), requestLog)
        XCTAssertTrue(control.buttons[catalog["attendance.status.booked"]].isSelected, "Anna starts as Geboekt")
        XCTAssertTrue(control.isEnabled)

        control.buttons[catalog["attendance.status.attended"]].tap()
        XCTAssertTrue(
            Polling.until(timeout: timeout, interval: 0.2) { server.attendanceRequests.count == 1 }, requestLog
        )
        let first = try XCTUnwrap(server.attendanceRequests.first)
        XCTAssertEqual(first["status"], "attended")
        XCTAssertEqual(first["clientId"], StubSessionRoutes.annaID)
        XCTAssertEqual(first["sessionId"], StubSessionRoutes.seededSessionID)
        XCTAssertEqual(first["surface"], "ios")
        XCTAssertNotNil(first["clientRequestId"])
        XCTAssertTrue(
            Polling.until(timeout: timeout, interval: 0.2) {
                control.buttons[self.catalog["attendance.status.attended"]].isSelected
            },
            "the button shows as selected"
        )

        control.buttons[catalog["attendance.status.booked"]].tap()
        XCTAssertTrue(
            Polling.until(timeout: timeout, interval: 0.2) { server.attendanceRequests.count == 2 }, requestLog
        )
        XCTAssertEqual(server.attendanceRequests.last?["status"], "booked")
        XCTAssertNotEqual(
            server.attendanceRequests.last?["clientRequestId"], first["clientRequestId"], "a second change, a second ID"
        )
        XCTAssertTrue(
            Polling.until(timeout: timeout, interval: 0.2) {
                control.buttons[self.catalog["attendance.status.booked"]].isSelected
            }
        )
    }

    func test_F025_Design_theControlIsOffBeforeTheWindowWithTheTime() throws {
        let (screen, server) = try launch()
        let app = screen.app
        let opens = Date().addingTimeInterval(3 * 3600)
        server.setAttendanceOpens(StubSessionRoutes.seededSessionID, at: opens)
        openSeededSession(app)

        let control = app.segmentedControls[annaControl]
        XCTAssertTrue(control.waitUntilExists(timeout: timeout), requestLog)
        XCTAssertFalse(control.isEnabled, "disabled before the window")
        let note = any("session.attendance.note", in: app)
        XCTAssertTrue(note.waitUntilExists(timeout: timeout), requestLog)
        XCTAssertEqual(note.label, String(format: catalog["attendance.app.from"], time(opens)))
        XCTAssertTrue(server.attendanceRequests.isEmpty)
    }

    func test_F025_AC6_aCancelledSessionSaysCancelledAndTheControlIsOff() throws {
        let (screen, server) = try launch()
        let app = screen.app
        server.cancelSession(StubSessionRoutes.seededSessionID)
        openSeededSession(app)

        let note = any("session.attendance.note", in: app)
        XCTAssertTrue(note.waitUntilExists(timeout: timeout), requestLog)
        XCTAssertEqual(note.label, catalog["attendance.app.cancelled"])
        XCTAssertFalse(app.segmentedControls[annaControl].isEnabled)
    }

    func test_F025_AC8_aTapWhileOfflineWaitsForTheConnection() throws {
        let (screen, server) = try launch(offline: true)
        let app = screen.app
        openSeededSession(app)

        let control = app.segmentedControls[annaControl]
        XCTAssertTrue(control.waitUntilExists(timeout: timeout), requestLog)
        control.buttons[catalog["attendance.status.noShow"]].tap()
        let waiting = any("session.attendance.line.\(StubSessionRoutes.annaID)", in: app)
        XCTAssertTrue(waiting.waitUntilExists(timeout: timeout), requestLog)
        XCTAssertEqual(waiting.label, catalog["attendance.app.waiting"])
        XCTAssertTrue(control.buttons[catalog["attendance.status.noShow"]].isSelected, "the row shows what was tapped")
        XCTAssertTrue(server.attendanceRequests.isEmpty)
    }
}

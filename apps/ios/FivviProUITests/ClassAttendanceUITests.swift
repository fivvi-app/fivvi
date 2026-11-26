import XCTest

/// CO-05 *Aanwezigheid* of a class date and *Iedereen aanwezig* (F025, iOS), in nl and en, against the stub server: "Kracht" with
/// seven participants (synthetic), opened from TD-03. The phone's network path is fixed offline (`-UITestConnectivity`) or the
/// stub drops the connection, so the offline queue is what the tests drive.
@MainActor
final class ClassAttendanceUITests: AttendanceUITestCase {
    func test_F025_AC4_classAttendanceSummaryUpdates() throws {
        let (app, server) = try launchKracht()
        openAttendance(app)
        waitForSummary(app, summaryLabel(0, 0, 7))

        var attended = 0
        for name in StubSessionRoutes.krachtNames.prefix(5) {
            tapAttended(name, app)
            attended += 1
            waitForSummary(app, summaryLabel(attended, 0, 7 - attended))
        }
        tapNoShow("Finn Smit", app)
        waitForSummary(app, summaryLabel(5, 1, 1))

        waitForRequests(server, 6)
        XCTAssertEqual(server.attendanceRequests.map { $0["status"] }.suffix(1), ["no_show"])
        XCTAssertEqual(Set(server.attendanceRequests.compactMap { $0["surface"] }), ["ios"])
        XCTAssertEqual(Set(server.attendanceRequests.compactMap { $0["clientRequestId"] }).count, 6)
        waitForRow("Anna de Vries", app, rowLabel("Anna de Vries", "attended"))
        // Tapping the selected one again takes it back.
        tapAttended("Anna de Vries", app)
        waitForSummary(app, summaryLabel(4, 1, 2))
    }

    func test_F025_CO05_atTheLargestTextSizeTheButtonsSitUnderTheName() throws {
        let (app, server) = try launchKracht(textSize: AppLaunch.largestTextSize)
        openAttendance(app)
        let row = row("Anna de Vries", app)
        XCTAssertTrue(row.waitUntilExists(timeout: timeout), requestLog)
        // Scrolled until the whole row is on screen, above the tab bar.
        let screenHeight = app.windows.firstMatch.frame.height
        for _ in 0..<8 where !row.isHittable || row.frame.maxY > screenHeight * 0.8 { app.swipeUp() }
        XCTAssertTrue(row.isHittable, "the row is on screen")
        // The row is as high as a name and the buttons under it, not one line of 52 pt.
        XCTAssertGreaterThan(row.frame.height, 100)
        tapAttended("Anna de Vries", app, stacked: true)
        waitForRequests(server, 1)
        XCTAssertEqual(server.attendanceRequests.first?["status"], "attended")
        XCTAssertEqual(server.attendanceRequests.first?["clientId"], participantID("Anna de Vries"))
        waitForRow("Anna de Vries", app, rowLabel("Anna de Vries", "attended"))
    }

    func test_F025_AC5_beforeTheWindowTheButtonsAreOffWithTheTime() throws {
        let opens = Date().addingTimeInterval(2 * 3600)
        let server = try StubServer(signIn: StubServer.SignIn(
            email: "owner@example.com", workspaceName: "John's Gym", role: "owner", name: "John Smit"
        ))
        server.seedKrachtParticipants()
        server.setAttendanceOpens(krachtID, at: opens)
        let (app, _) = try launchKracht(server: server)
        openAttendance(app)

        let early = any("attendance.tooEarly", in: app)
        XCTAssertTrue(early.waitUntilExists(timeout: timeout), requestLog)
        XCTAssertEqual(early.label, String(format: catalog["attendance.tooEarly"], time(opens)))
        XCTAssertTrue(row("Anna de Vries", app).waitUntilExists(timeout: timeout), requestLog)
        XCTAssertFalse(app.buttons["attendance.everyone"].isEnabled)
        tapAttended("Anna de Vries", app)
        XCTAssertFalse(
            Polling.until(timeout: 1.5, interval: 0.2) { !server.attendanceRequests.isEmpty },
            "the buttons are off: a tap sends nothing"
        )
        waitForSummary(app, summaryLabel(0, 0, 7))
    }

    func test_F025_AC6_cancelledClassNeedsNoAttendance() throws {
        let (app, server) = try launchKracht()
        openAttendance(app)
        XCTAssertTrue(row("Anna de Vries", app).waitUntilExists(timeout: timeout), requestLog)

        server.cancelSession(krachtID)
        XCUIDevice.shared.press(.home)
        _ = app.wait(for: .runningBackground, timeout: timeout)
        app.activate()

        let cancelled = any("attendance.cancelled", in: app)
        XCTAssertTrue(cancelled.waitUntilExists(timeout: timeout), requestLog)
        XCTAssertEqual(cancelled.label, catalog["attendance.cancelledClass"])
        XCTAssertFalse(app.buttons["attendance.everyone"].exists)
        tapAttended("Anna de Vries", app)
        XCTAssertFalse(
            Polling.until(timeout: 1.5, interval: 0.2) { !server.attendanceRequests.isEmpty },
            "a cancelled class has no buttons: a tap on where they were sends nothing"
        )
        XCTAssertEqual(row("Anna de Vries", app).label, rowLabel("Anna de Vries", "booked"))
        waitForSummary(app, summaryLabel(0, 0, 7))
    }

    func test_F025_IedereenAanwezig_marksEveryOpenParticipantAndAnnaStaysNoShow() throws {
        let (app, server) = try launchKracht(statuses: ["Anna": "no_show"])
        openAttendance(app)
        waitForSummary(app, summaryLabel(0, 1, 6))

        let everyone = app.buttons["attendance.everyone"]
        XCTAssertTrue(everyone.waitUntilExists(timeout: timeout))
        XCTAssertEqual(everyone.label, catalog["attendance.everyone"])
        everyone.tap()

        waitForSummary(app, summaryLabel(6, 1, 0))
        waitForRow("Anna de Vries", app, rowLabel("Anna de Vries", "noShow"))
        waitForRow("Bram Jansen", app, rowLabel("Bram Jansen", "attended"))
        waitForRequests(server, 1)
        XCTAssertEqual(server.attendanceRequests.first?["kind"], "everyone")
        XCTAssertEqual(server.attendanceRequests.first?["surface"], "ios")
        XCTAssertFalse(everyone.isEnabled, "nobody is left open")
    }

    func test_F025_AC8_offlineQueueSurvivesRestartAndSyncsInOrder() throws {
        let (app, server) = try launchKracht(offline: true)
        openAttendance(app)
        for name in ["Anna de Vries", "Bram Jansen", "Chris Bakker"] { tapAttended(name, app) }

        waitForSummary(app, summaryLabel(3, 0, 4))
        for name in ["Anna de Vries", "Bram Jansen", "Chris Bakker"] {
            waitForRow(name, app, rowLabel(name, "attended", line: catalog["attendance.app.waiting"]))
        }
        XCTAssertTrue(server.attendanceRequests.isEmpty, "nothing is sent while the phone is offline")

        // The app is closed and opened again, now online: what waited is sent, in order.
        close(app)
        let (again, _) = try launchKracht(offline: false, server: server, session: .asLeft)
        openAttendance(again)
        waitForRequests(server, 3)
        XCTAssertEqual(
            server.attendanceRequests.compactMap { $0["clientId"] },
            ["Anna de Vries", "Bram Jansen", "Chris Bakker"].map(participantID), "in the order they were tapped"
        )
        XCTAssertEqual(Set(server.attendanceRequests.compactMap { $0["clientRequestId"] }).count, 3)
        waitForSummary(again, summaryLabel(3, 0, 4))
        waitForRow("Anna de Vries", again, rowLabel("Anna de Vries", "attended"))
    }

    func test_F025_AC9_refusedQueuedTapReverts() throws {
        let (app, server) = try launchKracht()
        openAttendance(app)
        waitForSummary(app, summaryLabel(0, 0, 7))
        // The connection is lost: the tap waits. Meanwhile John cancels the class.
        server.setOffline(true)
        tapAttended("Anna de Vries", app)
        waitForRow("Anna de Vries", app, rowLabel("Anna de Vries", "attended", line: catalog["attendance.app.waiting"]))
        waitForSummary(app, summaryLabel(1, 0, 6))
        server.cancelSession(krachtID)
        server.setOffline(false)

        let reverted = rowLabel("Anna de Vries", "booked", line: catalog["attendance.cancelledClass"])
        XCTAssertTrue(
            Polling.until(timeout: timeout * 2, interval: 0.5) { self.row("Anna de Vries", app).label == reverted },
            "the row reverts and shows the cancelled message: \(requestLog)"
        )
        XCTAssertEqual(any("attendance.cancelled", in: app).label, catalog["attendance.cancelledClass"])
        waitForSummary(app, summaryLabel(0, 0, 7))
    }

    func test_F025_IedereenAanwezigOffline_isOneQueuedRequestAfterATapAndSurvivesARestart() throws {
        let (app, server) = try launchKracht(statuses: ["Anna": "no_show"], offline: true)
        openAttendance(app)
        tapNoShow("Bram Jansen", app)
        waitForSummary(app, summaryLabel(0, 2, 5))
        let everyone = app.buttons["attendance.everyone"]
        XCTAssertTrue(everyone.waitUntilExists(timeout: timeout))
        everyone.tap()

        waitForSummary(app, summaryLabel(5, 2, 0))
        for name in StubSessionRoutes.krachtNames.dropFirst(2) {
            waitForRow(name, app, rowLabel(name, "attended", line: catalog["attendance.app.waiting"]))
        }
        waitForRow("Anna de Vries", app, rowLabel("Anna de Vries", "noShow"))
        XCTAssertTrue(server.attendanceRequests.isEmpty)

        close(app)
        let (again, _) = try launchKracht(offline: true, server: server, session: .asLeft)
        openAttendance(again)
        waitForSummary(again, summaryLabel(5, 2, 0))
        waitForRow(
            "Gijs de Boer", again, rowLabel("Gijs de Boer", "attended", line: catalog["attendance.app.waiting"])
        )

        close(again)
        let (online, _) = try launchKracht(offline: false, server: server, session: .asLeft)
        openAttendance(online)
        waitForRequests(server, 2)
        XCTAssertEqual(
            server.attendanceRequests.map { $0["kind"] }, ["set", "everyone"], "in order, the everyone request once"
        )
        waitForSummary(online, summaryLabel(5, 2, 0))
    }

    func test_F025_IedereenAanwezigOffline_whenTheSyncRejectsItTheRowsRevertWithTheMessage() throws {
        let (app, server) = try launchKracht(statuses: ["Anna": "no_show"])
        openAttendance(app)
        waitForSummary(app, summaryLabel(0, 1, 6))
        server.setOffline(true)
        tapNoShow("Bram Jansen", app)
        app.buttons["attendance.everyone"].tap()
        waitForSummary(app, summaryLabel(5, 2, 0))
        server.cancelSession(krachtID)
        server.setOffline(false)

        let gijs = row("Gijs de Boer", app)
        let reverted = rowLabel("Gijs de Boer", "booked", line: catalog["attendance.cancelledClass"])
        XCTAssertTrue(
            Polling.until(timeout: timeout * 2, interval: 0.5) { gijs.label == reverted },
            "the rows revert with the message: \(requestLog)"
        )
        for name in StubSessionRoutes.krachtNames.dropFirst() {
            XCTAssertEqual(
                row(name, app).label, rowLabel(name, "booked", line: catalog["attendance.cancelledClass"]), name
            )
        }
        XCTAssertEqual(row("Anna de Vries", app).label, rowLabel("Anna de Vries", "noShow"), "Anna was no-show before")
        waitForSummary(app, summaryLabel(0, 1, 6))
    }

    func test_F025_signingOutWithWaitingTapsWarnsFirstAndClearsThemOnConfirm() throws {
        let (app, server) = try launchKracht(offline: true)
        openAttendance(app)
        tapAttended("Anna de Vries", app)
        waitForSummary(app, summaryLabel(1, 0, 6))
        // Back to the home, whose sign-out is the only way out of the app.
        let back = app.navigationBars.buttons.firstMatch
        XCTAssertTrue(back.tap(until: app.staticTexts["classDate.title"], timeout: timeout))
        let signOut = app.buttons["home.signOut"]
        XCTAssertTrue(app.navigationBars.buttons.firstMatch.tap(until: signOut, timeout: timeout), requestLog)
        signOut.tap()

        let title = app.staticTexts[catalog["attendance.app.signOutTitle"]].firstMatch
        XCTAssertTrue(title.waitUntilExists(timeout: timeout), "the warning names what would be lost: \(requestLog)")
        XCTAssertTrue(app.staticTexts[String(format: catalog["attendance.app.signOutMessage"], 1)].firstMatch.exists)

        let confirm = any("home.signOut.confirm", in: app)
        XCTAssertTrue(confirm.waitUntilExists(timeout: timeout))
        confirm.tap()
        XCTAssertTrue(app.staticTexts["signIn.title"].waitUntilExists(timeout: timeout), requestLog)
        XCTAssertTrue(server.attendanceRequests.isEmpty, "what waited is not sent after the sign-out")
    }
}

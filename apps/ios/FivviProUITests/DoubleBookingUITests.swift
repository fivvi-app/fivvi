import XCTest

/// PS-07 *Dubbele boeking* (F023, spec #459, ticket #542, AC6) in nl and en: planning a session over one's own session
/// (PS-04) and moving one over it (PS-05) shows the native alert from the API's `409 trainer_conflict`; *Terug* keeps the
/// form, *Toch opslaan* sends the same request again with `allowConflicts`.
@MainActor
final class DoubleBookingUITests: PrivateSessionUITestCase {
    /// The alert of PS-07 once it shows, with its title and the one line it lists.
    private func alert(_ app: XCUIApplication) -> XCUIElement {
        let alert = app.alerts.firstMatch
        XCTAssertTrue(alert.waitUntilExists(timeout: timeout), requestLog)
        return alert
    }

    func test_F023_AC6_doubleBookingAlertOnPlanAndReschedule() throws {
        let (screen, server) = try launch()
        let app = screen.app

        // The first session at the next full hour has nothing in its way: no alert.
        openNewSession(app)
        chooseAnna(app)
        app.buttons["newSession.save"].tap()
        XCTAssertTrue(app.staticTexts["session.title"].waitUntilExists(timeout: timeout), requestLog)
        XCTAssertFalse(app.alerts.firstMatch.exists)
        XCTAssertNotEqual(server.plannedSessions.first?["allowConflicts"], "true")
        let first = try XCTUnwrap(server.plannedSessions.first)
        let start = try XCTUnwrap(first["localStart"])

        // PS-04: the same start again overlaps one's own session: "Je hebt dan al iets".
        app.navigationBars.buttons.firstMatch.tap()
        openNewSession(app)
        chooseAnna(app)
        app.buttons["newSession.save"].tap()
        let planAlert = alert(app)
        XCTAssertTrue(
            planAlert.staticTexts[catalog["sessions.doubleBooking.titleOwn"]].exists, planAlert.debugDescription
        )
        let line = planAlert.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@ AND label CONTAINS %@", start, "Anna de Vries")
        ).firstMatch
        XCTAssertTrue(line.exists, planAlert.debugDescription)
        XCTAssertTrue(line.label.contains(catalog["sessions.doubleBooking.typePrivate"]), line.label)
        XCTAssertEqual(server.plannedSessions.count, 2, "the API was asked and refused")

        // Terug: the form stays as it was and sends nothing more.
        planAlert.buttons[catalog["sessions.doubleBooking.back"]].firstMatch.tap()
        XCTAssertTrue(Polling.until(timeout: timeout, interval: 0.2) { !app.alerts.firstMatch.exists })
        XCTAssertTrue(app.staticTexts["newSession.title"].exists, "still open")
        XCTAssertEqual(app.staticTexts["newSession.clientName"].label, "Anna de Vries", "what was entered stays")
        XCTAssertEqual(server.plannedSessions.count, 2, "Terug sends nothing")

        // Toch opslaan: the same request again with `allowConflicts`; TD-02 of the new session opens.
        app.buttons["newSession.save"].tap()
        alert(app).buttons[catalog["sessions.doubleBooking.saveAnyway"]].firstMatch.tap()
        XCTAssertTrue(app.staticTexts["session.title"].waitUntilExists(timeout: timeout), requestLog)
        let anyway = try XCTUnwrap(server.plannedSessions.last)
        XCTAssertEqual(anyway["allowConflicts"], "true")
        XCTAssertEqual(anyway["localStart"], start, "the same request")
        XCTAssertEqual(server.plannedSessions.count, 4, "Opslaan asked again and was refused again, then Toch opslaan")

        try rescheduleOverTheFirst(app, server: server, start: start)
    }

    /// PS-05 from TD-02 of the second session.
    private func rescheduleOverTheFirst(_ app: XCUIApplication, server: StubServer, start: String) throws {
        // PS-05: moving the new session to where it already is overlaps the first one.
        app.buttons["session.menu"].tap()
        app.buttons["session.reschedule"].tap()
        let submit = app.buttons["reschedule.submit"]
        XCTAssertTrue(submit.waitUntilExists(timeout: timeout))
        submit.tap()
        let moveAlert = alert(app)
        XCTAssertTrue(
            moveAlert.staticTexts[catalog["sessions.doubleBooking.titleOwn"]].exists, moveAlert.debugDescription
        )
        XCTAssertTrue(moveAlert.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@ AND label CONTAINS %@", start, "Anna de Vries")
        ).firstMatch.exists, moveAlert.debugDescription)
        XCTAssertNotEqual(server.movedSessions.last?["allowConflicts"], "true")

        moveAlert.buttons[catalog["sessions.doubleBooking.back"]].firstMatch.tap()
        XCTAssertTrue(Polling.until(timeout: timeout, interval: 0.2) { !app.alerts.firstMatch.exists })
        XCTAssertTrue(app.buttons["reschedule.submit"].exists, "the form stays")
        XCTAssertEqual(server.movedSessions.count, 1, "Terug sends nothing")

        app.buttons["reschedule.submit"].tap()
        alert(app).buttons[catalog["sessions.doubleBooking.saveAnyway"]].firstMatch.tap()
        XCTAssertTrue(app.staticTexts["session.moved"].waitUntilExists(timeout: timeout), requestLog)
        XCTAssertEqual(server.movedSessions.last?["allowConflicts"], "true")
        XCTAssertEqual(server.movedSessions.last?["version"], "1", "the version the person saw")
    }
}

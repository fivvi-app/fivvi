import XCTest

/// PS-04 *Nieuwe privésessie* (F020, spec #425, ticket #445, AC1, AC2, AC10) in nl and en: **+** → *Privésessie*, the
/// client list, the trainer (fixed for a Trainer, a list for the Owner), offline, the discard confirmation, and the
/// session screen that opens after a save.
@MainActor
final class PrivateSessionUITests: PrivateSessionUITestCase {
    // MARK: PS-04

    func test_F020_AC1_AC10_aTrainerPlansASessionFromPlusAndTheSessionScreenOpens() throws {
        let (screen, server) = try launch()
        let app = screen.app
        let plus = app.buttons["home.new"]
        XCTAssertTrue(plus.waitUntilExists(timeout: timeout))
        XCTAssertEqual(plus.label, catalog["workspaceNav.new"])
        openNewSession(app)
        XCTAssertEqual(app.staticTexts["newSession.title"].label, catalog["sessions.form.title"])

        // AC2: a Trainer's trainer is fixed: their own line, no list.
        let fixed = app.staticTexts["newSession.trainerFixed"]
        XCTAssertTrue(fixed.waitUntilExists(timeout: timeout))
        XCTAssertTrue(
            fixed.label.hasSuffix(String(format: catalog["sessions.form.trainerMe"], "Sarah Visser")), fixed.label
        )
        XCTAssertFalse(any("newSession.trainer", in: app).exists, "no list for a Trainer")
        XCTAssertEqual(
            app.staticTexts["newSession.location"].label,
            String(format: catalog["sessions.form.location"], "John's Gym")
        )
        XCTAssertTrue(app.staticTexts["newSession.endsAt"].exists)

        // Without a client the save says so and sends nothing.
        app.buttons["newSession.save"].tap()
        XCTAssertTrue(app.staticTexts["newSession.clientError"].waitUntilExists(timeout: timeout))
        XCTAssertEqual(app.staticTexts["newSession.clientError"].label, catalog["sessions.form.errors.chooseClient"])
        XCTAssertTrue(server.plannedSessions.isEmpty)

        chooseAnna(app)
        XCTAssertEqual(app.staticTexts["newSession.clientName"].label, "Anna de Vries")
        XCTAssertTrue(app.switches["newSession.notify"].exists, "the confirmation toggle shows with the client")
        XCTAssertEqual(
            app.staticTexts["newSession.notifyNote"].label,
            String(format: catalog["sessions.form.notifyNote"], "anna@example.com", catalog["sessions.form.languageEn"])
        )
        let before = nextFullHour()
        app.buttons["newSession.save"].tap()

        // AC10: TD-02 opens with the data of the form.
        let title = app.staticTexts["session.title"]
        XCTAssertTrue(title.waitUntilExists(timeout: timeout))
        XCTAssertEqual(title.label, String(format: catalog["sessions.page.heading"], "Anna de Vries"))
        XCTAssertEqual(app.staticTexts["session.location"].label, "John's Gym")
        XCTAssertEqual(app.staticTexts["session.workspace"].label, "John's Gym")
        XCTAssertEqual(app.staticTexts["session.trainer"].label, catalog["sessions.page.you"], "Jij / You")
        let sent = try XCTUnwrap(server.plannedSessions.first)
        let after = nextFullHour()
        XCTAssertNil(sent["trainerId"], "a Trainer sends none")
        XCTAssertEqual(sent["clientId"], StubSessionRoutes.annaID)
        XCTAssertTrue([before.date, after.date].contains(sent["localDate"] ?? ""), "today, the next full hour")
        XCTAssertTrue([before.time, after.time].contains(sent["localStart"] ?? ""), "the next full hour")
        XCTAssertEqual(sent["durationMinutes"], "60")
        XCTAssertEqual(sent["notify"], "true")
        XCTAssertEqual(sent["surface"], "ios")
        let path = "/api/v1/workspaces/7c1d2e3f-0000-4000-8000-000000000000/sessions/private"
        XCTAssertEqual(server.requests(to: path).first?.method, "POST")
    }

    func test_F020_AC2_anOwnerSeesAllTrainersAndPlansForAnother() throws {
        let (screen, server) = try launch(owner: true)
        let app = screen.app
        openNewSession(app)
        let trainer = any("newSession.trainer", in: app)
        XCTAssertTrue(trainer.waitUntilExists(timeout: timeout))
        XCTAssertFalse(app.staticTexts["newSession.trainerFixed"].exists, "an Owner chooses")
        let mine = String(format: catalog["sessions.form.trainerMe"], "John Smit")
        XCTAssertTrue(trainer.label.contains(mine), "starts on themself")

        trainer.tap()
        let other = app.buttons[StubSessionRoutes.otherTrainerName]
        XCTAssertTrue(other.waitUntilExists(timeout: timeout), "every trainer of the workspace")
        other.tap()
        chooseAnna(app)
        app.buttons["newSession.save"].tap()

        let title = app.staticTexts["session.title"]
        XCTAssertTrue(title.waitUntilExists(timeout: timeout))
        XCTAssertEqual(app.staticTexts["session.trainer"].label, StubSessionRoutes.otherTrainerName, "not Jij")
        XCTAssertEqual(server.plannedSessions.first?["trainerId"], StubSessionRoutes.otherMemberID)
    }

    func test_F020_AC10_offlineSavingIsOffAndNothingIsQueued() throws {
        let (screen, server) = try launch()
        let app = screen.app
        XCTAssertTrue(app.buttons["home.new"].waitUntilExists(timeout: timeout))
        server.setOffline(true)
        openNewSession(app)

        let offline = app.staticTexts["newSession.offline"]
        XCTAssertTrue(offline.waitUntilExists(timeout: timeout))
        XCTAssertEqual(offline.label, catalog["sessions.form.offline"])
        XCTAssertFalse(app.buttons["newSession.save"].isEnabled, "Opslaan is off")
        XCTAssertTrue(server.plannedSessions.isEmpty, "nothing is queued")

        server.setOffline(false)
        app.buttons["newSession.retry"].tap()
        XCTAssertTrue(Polling.until(timeout: timeout, interval: 0.3) { !offline.exists })
        XCTAssertTrue(app.buttons["newSession.save"].isEnabled, "back online it can save")
    }

    func test_F020_AC1_leavingWithSomethingEnteredAsksBeforeItIsThrownAway() throws {
        let (screen, _) = try launch()
        let app = screen.app
        openNewSession(app)
        chooseAnna(app)

        app.buttons["newSession.cancel"].tap()
        // The confirmation is the system's popover: *Weggooien*, and a tap outside it keeps editing.
        let discard = app.buttons["newSession.discard"].firstMatch
        XCTAssertTrue(discard.waitUntilExists(timeout: timeout))
        XCTAssertEqual(discard.label, catalog["sessions.form.discard"])
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.95)).tap()
        XCTAssertTrue(Polling.until(timeout: timeout, interval: 0.2) { !discard.exists })
        XCTAssertTrue(app.staticTexts["newSession.title"].exists, "still open")
        XCTAssertTrue(any("newSession.client", in: app).label.contains("Anna de Vries"), "what was entered stays")

        app.buttons["newSession.cancel"].tap()
        XCTAssertTrue(discard.waitUntilExists(timeout: timeout))
        discard.tap()
        XCTAssertTrue(Polling.until(timeout: timeout, interval: 0.3) { !app.staticTexts["newSession.title"].exists })
    }
}

import XCTest

/// PS-06 *Sessie annuleren?* from TD-02 ⋯ → *Annuleren* (F026 AC1a, AC4, iOS), in nl and en, against the stub server: the
/// seeded session is Anna's tomorrow at 09:00 with the signed-in person; Sarah is a Trainer, John the Owner (synthetic).
@MainActor
final class CancelSessionUITests: PrivateSessionUITestCase {
    private func openCancel(_ app: XCUIApplication) {
        let menu = app.buttons["session.menu"]
        XCTAssertTrue(menu.waitUntilExists(timeout: timeout), requestLog)
        menu.tap()
        let cancel = app.buttons["session.cancel"]
        XCTAssertTrue(cancel.waitUntilExists(timeout: timeout), requestLog)
        cancel.tap()
        XCTAssertTrue(app.staticTexts["cancel.title"].waitUntilExists(timeout: timeout), requestLog)
    }

    func test_F026_AC1a_clientCancelNudgesReschedule() throws {
        let (screen, server) = try launch()
        let app = screen.app
        openSeededSession(app)
        openCancel(app)

        // De klant is the default: the question first, Verplaatsen as the main button, no confirm step yet.
        XCTAssertEqual(app.staticTexts["cancel.title"].label, catalog["sessions.cancel.title"])
        XCTAssertEqual(app.staticTexts["cancel.nudge"].label, catalog["sessions.cancel.nudgeQuestion"])
        XCTAssertEqual(app.buttons["cancel.reschedule"].label, catalog["sessions.cancel.nudgeReschedule"])
        XCTAssertEqual(app.buttons["cancel.cancelAnyway"].label, catalog["sessions.cancel.nudgeCancelAnyway"])
        XCTAssertEqual(app.buttons["cancel.back"].label, catalog["sessions.cancel.back"], "Terug, never Annuleren")
        XCTAssertFalse(app.buttons["cancel.submit"].exists)

        // Wij skips the question.
        app.buttons["cancel.who.workspace"].tap()
        XCTAssertTrue(app.buttons["cancel.submit"].waitUntilExists(timeout: timeout))
        XCTAssertFalse(app.staticTexts["cancel.nudge"].exists)
        XCTAssertEqual(app.buttons["cancel.submit"].label, catalog["sessions.cancel.submit"])
        app.buttons["cancel.who.client"].tap()
        XCTAssertTrue(app.staticTexts["cancel.nudge"].waitUntilExists(timeout: timeout))

        // Verplaatsen opens PS-05 for the same session; nothing is cancelled.
        app.buttons["cancel.reschedule"].tap()
        XCTAssertTrue(app.staticTexts["reschedule.title"].waitUntilExists(timeout: timeout), requestLog)
        XCTAssertEqual(app.buttons["reschedule.submit"].label, catalog["sessions.reschedule.submitNotify"])
        XCTAssertTrue(server.cancelledSessions.isEmpty, "nothing was cancelled")
        app.buttons["reschedule.cancel"].tap()

        // Toch annuleren shows the confirm step of AC1.
        openCancel(app)
        app.buttons["cancel.cancelAnyway"].tap()
        XCTAssertTrue(app.buttons["cancel.submit"].waitUntilExists(timeout: timeout))
        XCTAssertFalse(app.staticTexts["cancel.nudge"].exists)
        XCTAssertTrue(app.switches["cancel.notify"].exists, "the email box shows at the confirm step")
        XCTAssertEqual(
            app.staticTexts["cancel.notifyNote"].label,
            String(
                format: catalog["sessions.cancel.notifyNote"], "anna@example.com", catalog["sessions.form.languageEn"]
            )
        )
        XCTAssertTrue(server.cancelledSessions.isEmpty)
    }

    func test_F026_AC4_cancelSessionFromSessionScreen() throws {
        let (screen, server) = try launch()
        let app = screen.app
        openSeededSession(app)
        openCancel(app)
        app.buttons["cancel.cancelAnyway"].tap()
        let submit = app.buttons["cancel.submit"]
        XCTAssertTrue(submit.waitUntilExists(timeout: timeout))
        XCTAssertEqual(submit.label, catalog["sessions.cancel.submit"])

        submit.tap()

        // The result equals AC1: De klant, no email, the version seen, and the screen says it is cancelled.
        let done = app.staticTexts["session.cancelDone"]
        XCTAssertTrue(done.waitUntilExists(timeout: timeout), requestLog)
        XCTAssertEqual(done.label, catalog["sessions.cancel.done"])
        let sent = try XCTUnwrap(server.cancelledSessions.first)
        XCTAssertEqual(sent["initiator"], "client")
        XCTAssertEqual(sent["notify"], "false")
        XCTAssertEqual(sent["version"], "1")
        XCTAssertEqual(sent["surface"], "ios")
        XCTAssertEqual(sent["sessionId"], StubSessionRoutes.seededSessionID)
        let banner = app.staticTexts["session.cancelled"]
        XCTAssertTrue(banner.waitUntilExists(timeout: timeout))
        XCTAssertTrue(banner.label.contains("Sarah Visser"), "the banner names who cancelled: \(banner.label)")
        XCTAssertTrue(banner.label.contains(catalog["sessions.page.cancelledByClient"]), banner.label)

        // Only Klantprofiel is left in the menu.
        app.buttons["session.menu"].tap()
        XCTAssertTrue(app.buttons["session.clientProfile"].waitUntilExists(timeout: timeout))
        XCTAssertFalse(app.buttons["session.cancel"].exists)
        XCTAssertFalse(app.buttons["session.reschedule"].exists)
    }

    func test_F026_AC2_theOwnerCancelsWithWijAndTheEmailBoxIsOn() throws {
        let (screen, server) = try launch(owner: true)
        let app = screen.app
        openSeededSession(app)
        openCancel(app)
        app.buttons["cancel.who.workspace"].tap()

        let notify = app.switches["cancel.notify"]
        XCTAssertTrue(notify.waitUntilExists(timeout: timeout))
        XCTAssertEqual(notify.value as? String, "1", "on when the workspace cancels")
        app.buttons["cancel.submit"].tap()

        XCTAssertTrue(app.staticTexts["session.cancelDone"].waitUntilExists(timeout: timeout), requestLog)
        let sent = try XCTUnwrap(server.cancelledSessions.first)
        XCTAssertEqual(sent["initiator"], "workspace")
        XCTAssertEqual(sent["notify"], "true")
        let banner = app.staticTexts["session.cancelled"]
        XCTAssertTrue(banner.waitUntilExists(timeout: timeout))
        XCTAssertFalse(banner.label.contains(catalog["sessions.page.cancelledByClient"]), "no suffix for Wij")
    }

    func test_F026_AC4_cancelDisabledOffline() throws {
        // The phone's network path says offline (`-UITestConnectivity offline`): Annuleren is off before any request fails.
        let (screen, server) = try launch(offline: true)
        let app = screen.app
        openSeededSession(app)

        let offline = app.staticTexts["session.cancelOffline"]
        XCTAssertTrue(offline.waitUntilExists(timeout: timeout), requestLog)
        XCTAssertEqual(offline.label, catalog["sessions.cancel.offline"])
        app.buttons["session.menu"].tap()
        let cancel = app.buttons["session.cancel"]
        XCTAssertTrue(cancel.waitUntilExists(timeout: timeout))
        XCTAssertFalse(cancel.isEnabled, "Annuleren is off offline")
        XCTAssertTrue(server.cancelledSessions.isEmpty, "nothing is queued")
    }

    func test_F026_AC4_cancelIsOnWhileOnline() throws {
        let (screen, _) = try launch()
        let app = screen.app
        openSeededSession(app)
        XCTAssertFalse(app.staticTexts["session.cancelOffline"].exists)
        app.buttons["session.menu"].tap()
        let cancel = app.buttons["session.cancel"]
        XCTAssertTrue(cancel.waitUntilExists(timeout: timeout), requestLog)
        XCTAssertTrue(cancel.isEnabled)
    }

    func test_F026_AC5_aTrainerHasNoAnnulerenOnSomeoneElsesSession() throws {
        let (screen, server) = try launch()
        let app = screen.app
        server.bookSeededSessionWithAnotherTrainer()
        openSeededSession(app)
        let menu = app.buttons["session.menu"]
        XCTAssertTrue(menu.waitUntilExists(timeout: timeout), requestLog)
        menu.tap()
        XCTAssertTrue(app.buttons["session.clientProfile"].waitUntilExists(timeout: timeout))
        XCTAssertFalse(app.buttons["session.cancel"].exists, "Annuleren is hidden on a colleague's session")
    }
}

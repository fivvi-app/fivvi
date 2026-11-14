import XCTest

/// The session screen (TD-02) with its *Route* and the trainer (*Jij* / *You*), *Verplaatsen* (PS-05, F020 AC6, AC8) and
/// *Komende sessies* on the client profile (AC9), in nl and en. The stub server starts with John's Gym's clients and one
/// session, Anna's tomorrow at 09:00 (synthetic).
@MainActor
final class SessionScreenUITests: PrivateSessionUITestCase {
    func test_F020_AC9_theProfileListsTheComingSessionsAndTheEmptyText() throws {
        let (screen, _) = try launch()
        let app = screen.app
        openSeededSession(app)
        XCTAssertEqual(
            app.staticTexts["session.title"].label, String(format: catalog["sessions.page.heading"], "Anna de Vries")
        )
        app.navigationBars.buttons.firstMatch.tap()
        XCTAssertTrue(app.staticTexts["clientProfile.upcomingTitle"].waitUntilExists(timeout: timeout))
        XCTAssertEqual(app.staticTexts["clientProfile.upcomingTitle"].label, catalog["clients.profile.upcomingTitle"])
        XCTAssertFalse(app.staticTexts["clientProfile.upcomingEmpty"].exists)
        let row = any("clientProfile.upcoming.\(StubSessionRoutes.seededSessionID)", in: app)
        XCTAssertTrue(row.label.contains("Sarah Visser"), "the row names the trainer: \(row.label)")

        app.buttons["clientProfile.back"].tap()
        let mark = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH 'clients.row.' AND label BEGINSWITH 'Mark'")
        ).firstMatch
        XCTAssertTrue(mark.waitUntilExists(timeout: timeout))
        mark.tap()
        let empty = app.staticTexts["clientProfile.upcomingEmpty"]
        XCTAssertTrue(empty.waitUntilExists(timeout: timeout))
        XCTAssertEqual(empty.label, catalog["clients.profile.upcomingEmpty"])
    }

    func test_F020_Design_theRouteOpensTheMapsAppWithTheAddressAndTheWorkspaceShowsTheTrainer() throws {
        let (screen, _) = try launch(recordsLinks: true)
        let app = screen.app
        openSeededSession(app)

        let route = app.buttons["session.route"]
        XCTAssertTrue(route.waitUntilExists(timeout: timeout))
        XCTAssertEqual(route.label, catalog["sessions.page.route"])
        try assertTouchTarget(route, on: screen)
        XCTAssertEqual(app.staticTexts["session.workspace"].label, "John's Gym")
        XCTAssertEqual(app.staticTexts["session.trainer"].label, catalog["sessions.page.you"])
        route.tap()

        let opened = app.staticTexts["uitest.openedLink"]
        XCTAssertTrue(
            Polling.until(timeout: timeout, interval: 0.2) { opened.label.hasPrefix("https://maps.apple.com/") }
        )
        let link = opened.label.removingPercentEncoding ?? opened.label
        XCTAssertTrue(link.contains("daddr=Kerkstraat 12, 1234 AB Amsterdam"), link)
    }

    func test_F020_AC6_aMoveWithAndWithoutNotifyTheButtonSaysWhatHappens() throws {
        let (screen, server) = try launch()
        let app = screen.app
        openSeededSession(app)

        // With notify (on for a session still to come).
        app.buttons["session.menu"].tap()
        app.buttons["session.reschedule"].tap()
        let submit = app.buttons["reschedule.submit"]
        XCTAssertTrue(submit.waitUntilExists(timeout: timeout))
        XCTAssertEqual(app.staticTexts["reschedule.title"].label, catalog["sessions.reschedule.title"])
        XCTAssertEqual(submit.label, catalog["sessions.reschedule.submitNotify"])
        XCTAssertEqual(
            app.staticTexts["reschedule.location"].label,
            String(format: catalog["sessions.reschedule.locationUnchanged"], "John's Gym")
        )
        submit.tap()
        let moved = app.staticTexts["session.moved"]
        XCTAssertTrue(moved.waitUntilExists(timeout: timeout))
        XCTAssertTrue(moved.label.contains("09:00"), moved.label)
        XCTAssertEqual(server.movedSessions.last?["notify"], "true")
        XCTAssertEqual(server.movedSessions.last?["version"], "1")
        XCTAssertEqual(server.movedSessions.last?["sessionId"], StubSessionRoutes.seededSessionID)
        XCTAssertEqual(server.movedSessions.last?["surface"], "ios")

        // Without notify: the toggle off, the button says Verplaatsen alone.
        app.buttons["session.menu"].tap()
        app.buttons["session.reschedule"].tap()
        let toggle = app.switches["reschedule.notify"]
        XCTAssertTrue(toggle.waitUntilExists(timeout: timeout))
        // The switch is at the row's trailing end; a tap on its label alone doesn't move it.
        toggle.coordinate(withNormalizedOffset: CGVector(dx: 0.93, dy: 0.5)).tap()
        let plain = catalog["sessions.reschedule.submit"]
        XCTAssertTrue(
            Polling.until(timeout: timeout, interval: 0.2) { app.buttons["reschedule.submit"].label == plain },
            app.buttons["reschedule.submit"].label
        )
        app.buttons["reschedule.submit"].tap()
        XCTAssertTrue(Polling.until(timeout: timeout, interval: 0.2) { server.movedSessions.count == 2 })
        XCTAssertEqual(server.movedSessions.last?["notify"], "false")
        XCTAssertEqual(server.movedSessions.last?["version"], "2", "the version the first move left")
    }

    func test_F020_AC8_aSessionChangedMeanwhileSaysWhoAndTheNextMoveGoesThrough() throws {
        let (screen, server) = try launch()
        let app = screen.app
        openSeededSession(app)
        server.changeSessionBySomeoneElse()

        app.buttons["session.menu"].tap()
        app.buttons["session.reschedule"].tap()
        let submit = app.buttons["reschedule.submit"]
        XCTAssertTrue(submit.waitUntilExists(timeout: timeout))
        submit.tap()
        let failed = app.staticTexts["reschedule.failed"]
        XCTAssertTrue(failed.waitUntilExists(timeout: timeout))
        let changedBy = String(format: catalog["sessions.reschedule.changedBy"], StubSessionRoutes.otherTrainerName)
        XCTAssertEqual(failed.label, changedBy)

        // A start the clocks skip is worded as the API refused it, under the field.
        server.refuseNextSessionStart()
        app.buttons["reschedule.submit"].tap()
        let skipped = app.staticTexts["reschedule.timeError"]
        XCTAssertTrue(skipped.waitUntilExists(timeout: timeout))
        let beginning = catalog["sessions.form.errors.timeDoesNotExist"].components(separatedBy: "%1$@").first ?? ""
        XCTAssertTrue(skipped.label.hasPrefix(beginning), skipped.label)

        app.buttons["reschedule.submit"].tap()
        XCTAssertTrue(app.staticTexts["session.moved"].waitUntilExists(timeout: timeout))
        XCTAssertEqual(server.movedSessions.last?["version"], "2", "the newest version")
    }
}

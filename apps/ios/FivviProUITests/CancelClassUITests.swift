import XCTest

/// TD-03 ⋯ → *Les annuleren* (F026 Design, iOS), in nl and en, against the stub server: *Kracht* tomorrow at 18:00 with three
/// booked clients; John is the Owner, Tom a Trainer (synthetic).
@MainActor
final class CancelClassUITests: PrivateSessionUITestCase {
    func test_F026_Design_ownerCancelsAClassDateAfterTheConfirmation() throws {
        let (screen, server) = try launch(owner: true, opensClassDate: StubSessionRoutes.seededClassDateID)
        let app = screen.app
        server.bookOnSeededClassDate(3)
        XCTAssertTrue(app.staticTexts["classDate.title"].waitUntilExists(timeout: timeout), requestLog)
        let menu = app.buttons["classDate.menu"]
        XCTAssertTrue(menu.waitUntilExists(timeout: timeout))
        menu.tap()
        let cancel = app.buttons["classDate.cancel"]
        XCTAssertTrue(cancel.waitUntilExists(timeout: timeout), requestLog)
        XCTAssertEqual(cancel.label, catalog["classes.cancel.action"], "Les annuleren / Cancel class")
        cancel.tap()

        // The native confirmation: the title, how many booked clients get an email, the destructive button and Terug.
        let alert = app.alerts.firstMatch
        XCTAssertTrue(alert.waitUntilExists(timeout: timeout), requestLog)
        XCTAssertTrue(alert.staticTexts[catalog["classes.cancel.title"]].firstMatch.exists)
        XCTAssertTrue(alert.staticTexts[String(format: catalog["classes.app.cancelBody"], 3)].firstMatch.exists)
        XCTAssertEqual(alert.buttons["classDate.cancel.back"].firstMatch.label, catalog["classes.cancel.back"])
        XCTAssertEqual(alert.buttons["classDate.cancel.submit"].firstMatch.label, catalog["classes.cancel.submit"])
        XCTAssertTrue(server.cancelledClassDates.isEmpty, "nothing is cancelled before the confirmation")
        alert.buttons["classDate.cancel.submit"].firstMatch.tap()

        // This date only: the banner shows and the menu is gone.
        let banner = app.staticTexts["classDate.cancelled"]
        XCTAssertTrue(banner.waitUntilExists(timeout: timeout), requestLog)
        XCTAssertTrue(banner.label.contains("John Smit"), banner.label)
        let sent = try XCTUnwrap(server.cancelledClassDates.first)
        XCTAssertEqual(sent["scope"], "this")
        XCTAssertEqual(sent["surface"], "ios")
        XCTAssertEqual(sent["version"], "1")
        XCTAssertEqual(sent["sessionId"], StubSessionRoutes.seededClassDateID)
        XCTAssertFalse(app.buttons["classDate.menu"].exists, "a cancelled date has no actions")
    }

    func test_F026_AC8_withoutParticipantsTheConfirmationSaysNobodyGetsAnEmail() throws {
        let (screen, _) = try launch(owner: true, opensClassDate: StubSessionRoutes.seededClassDateID)
        let app = screen.app
        XCTAssertTrue(app.buttons["classDate.menu"].waitUntilExists(timeout: timeout), requestLog)
        app.buttons["classDate.menu"].tap()
        app.buttons["classDate.cancel"].tap()
        let alert = app.alerts.firstMatch
        XCTAssertTrue(alert.waitUntilExists(timeout: timeout), requestLog)
        XCTAssertTrue(alert.staticTexts[catalog["classes.cancel.countNone"]].firstMatch.exists)
        alert.buttons["classDate.cancel.back"].firstMatch.tap()
        XCTAssertTrue(Polling.until(timeout: timeout, interval: 0.2) { !alert.exists })
        XCTAssertTrue(app.buttons["classDate.menu"].exists, "Terug cancels nothing")
    }

    func test_F026_Design_aTrainerHasNoLesAnnuleren() throws {
        let (screen, server) = try launch(opensClassDate: StubSessionRoutes.seededClassDateID)
        let app = screen.app
        XCTAssertTrue(app.staticTexts["classDate.title"].waitUntilExists(timeout: timeout), requestLog)
        XCTAssertFalse(app.buttons["classDate.menu"].exists, "Tom has no ⋯ menu on a class")
        XCTAssertFalse(app.buttons["classDate.cancel"].exists)
        XCTAssertTrue(server.cancelledClassDates.isEmpty)
    }

    func test_F026_AC4_lesAnnulerenIsOffOffline() throws {
        // The phone's network path says offline (`-UITestConnectivity offline`): Les annuleren is off before any request fails.
        let (screen, server) = try launch(
            owner: true, opensClassDate: StubSessionRoutes.seededClassDateID, offline: true
        )
        let app = screen.app
        XCTAssertTrue(app.buttons["classDate.menu"].waitUntilExists(timeout: timeout), requestLog)

        let offline = app.staticTexts["classDate.cancelOffline"]
        XCTAssertTrue(offline.waitUntilExists(timeout: timeout), requestLog)
        XCTAssertEqual(offline.label, catalog["classes.app.cancelOffline"])
        app.buttons["classDate.menu"].tap()
        let cancel = app.buttons["classDate.cancel"]
        XCTAssertTrue(cancel.waitUntilExists(timeout: timeout))
        XCTAssertFalse(cancel.isEnabled, "the item is off")
        XCTAssertFalse(app.alerts.firstMatch.exists, "nothing to confirm without a connection")
        XCTAssertTrue(server.cancelledClassDates.isEmpty, "nothing is queued")
    }
}

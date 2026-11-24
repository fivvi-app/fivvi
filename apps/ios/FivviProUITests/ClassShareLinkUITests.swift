import XCTest

/// TD-03 *Boekingslink delen* (F037 AC8, AC9, iOS; Android twin: #978), in nl and en, against the stub server: John
/// (Owner) and Sarah (Trainer, synthetic) share *Kracht* tomorrow at 18:00. A tap sends `POST …/booking-links` for
/// the date (the same link every time) and shows "Boekingslink gekopieerd" in a toast; the clipboard itself is read in the unit
/// tests, as the runner is another app and iOS asks before it may read the clipboard of the app.
@MainActor
final class ClassShareLinkUITests: PrivateSessionUITestCase {
    private let date = StubSessionRoutes.seededClassDateID

    /// Taps *Boekingslink delen* again until the stub server has answered `count` booking link requests. A second tap
    /// gets the same link, so a tap a slow simulator dropped can be made again (`Polling.acting`).
    private func tapUntilRequests(_ count: Int, _ share: XCUIElement, _ server: StubServer) -> Bool {
        Polling.acting(
            timeout: timeout, action: { share.tap() }, canRepeat: { share.exists && share.isHittable },
            report: { attempt, attempts in
                XCTContext.runActivity(
                    named: Polling.warning(identifier: share.identifier, attempt: attempt, of: attempts)
                ) { _ in }
            },
            until: { server.bookingLinkRequests.count >= count }
        )
    }

    func test_F037_AC8_theOwnerTapsBoekingslinkDelenAndSeesItCopiedAndASecondTapGivesTheSameLink() throws {
        let (screen, server) = try launch(owner: true, opensClassDate: date)
        let app = screen.app
        let share = app.buttons["classDate.shareLink"]
        XCTAssertTrue(share.waitUntilExists(timeout: timeout), requestLog)
        XCTAssertEqual(share.label, catalog["classes.app.shareLink"], "Boekingslink delen / Share booking link")
        XCTAssertFalse(app.staticTexts["toast.text"].exists, "nothing is copied before the tap")
        XCTAssertTrue(server.bookingLinkRequests.isEmpty)

        let copied = app.staticTexts["toast.text"]
        XCTAssertTrue(share.tap(until: copied, timeout: timeout), requestLog)
        XCTAssertEqual(copied.label, catalog["classes.app.shareLinkCopied"], "Boekingslink gekopieerd")
        let first = try XCTUnwrap(server.bookingLinkRequests.first)
        XCTAssertEqual(first["scope"], "session", "Eén les op een datum")
        XCTAssertEqual(first["language"], "visitor")
        XCTAssertEqual(first["sessionId"], date)
        XCTAssertEqual(first["surface"], "ios")
        XCTAssertEqual(first["status"], "201", "the first tap makes the link")

        XCTAssertTrue(tapUntilRequests(2, share, server), requestLog)
        let second = server.bookingLinkRequests[1]
        XCTAssertEqual(second["status"], "200", "the second tap finds it")
        XCTAssertEqual(second["linkId"], first["linkId"], "the same link")
        XCTAssertTrue(copied.waitUntilExists(timeout: timeout), "it says so again")
    }

    func test_F037_AC8_theOwnersMenuStartsWithBoekingslinkDelen() throws {
        let (screen, server) = try launch(owner: true, opensClassDate: date)
        let app = screen.app
        let menu = app.buttons["classDate.menu"]
        XCTAssertTrue(menu.waitUntilExists(timeout: timeout), requestLog)
        let item = app.buttons["classDate.shareLinkMenu"]
        XCTAssertTrue(menu.tap(until: item, timeout: timeout), requestLog)
        XCTAssertEqual(item.label, catalog["classes.app.shareLink"])
        let edit = app.buttons["classDate.edit"]
        XCTAssertTrue(edit.exists)
        XCTAssertLessThan(item.frame.minY, edit.frame.minY, "the first item, above Les wijzigen")

        XCTAssertTrue(item.tap(until: app.staticTexts["toast.text"], timeout: timeout), requestLog)
        XCTAssertEqual(server.bookingLinkRequests.first?["sessionId"], date)
    }

    func test_F037_AC9_aTrainerGetsTheSameLinkAndHasNoMenu() throws {
        let (screen, server) = try launch(opensClassDate: date)
        let app = screen.app
        let share = app.buttons["classDate.shareLink"]
        XCTAssertTrue(share.waitUntilExists(timeout: timeout), requestLog)
        XCTAssertFalse(app.buttons["classDate.menu"].exists, "no ⋯ menu beyond what F021 gives her")

        let copied = app.staticTexts["toast.text"]
        XCTAssertTrue(share.tap(until: copied, timeout: timeout), requestLog)
        XCTAssertEqual(copied.label, catalog["classes.app.shareLinkCopied"])
        let sent = try XCTUnwrap(server.bookingLinkRequests.first)
        XCTAssertEqual(sent["sessionId"], date)
        XCTAssertEqual(sent["language"], "visitor")
    }

    func test_F037_Unavailable_aCancelledDateHasNoBoekingslinkDelen() throws {
        let (screen, server) = try launch(owner: true, opensClassDate: date)
        let app = screen.app
        XCTAssertTrue(app.buttons["classDate.shareLink"].waitUntilExists(timeout: timeout), requestLog)
        let menu = app.buttons["classDate.menu"]
        let cancel = app.buttons["classDate.cancel"]
        XCTAssertTrue(menu.tap(until: cancel, timeout: timeout), requestLog)
        let alert = app.alerts.firstMatch
        XCTAssertTrue(cancel.tap(until: alert, timeout: timeout), requestLog)
        alert.buttons["classDate.cancel.submit"].firstMatch.tap()

        XCTAssertTrue(app.staticTexts["classDate.cancelled"].waitUntilExists(timeout: timeout), requestLog)
        XCTAssertTrue(Polling.until(timeout: timeout, interval: 0.2) { !app.buttons["classDate.shareLink"].exists })
        XCTAssertFalse(app.buttons["classDate.menu"].exists)
        XCTAssertTrue(server.bookingLinkRequests.isEmpty, "no link was asked for")
    }

    func test_F037_Unavailable_aPastClassDateHasNoBoekingslinkDelen() throws {
        // The app's clock says it is two days later: the seeded date, tomorrow at 18:00, has started.
        let later = ISO8601DateFormatter().string(from: Date().addingTimeInterval(2 * 24 * 3600))
        let (screen, server) = try launch(owner: true, opensClassDate: date, now: later)
        let app = screen.app
        XCTAssertTrue(app.staticTexts["classDate.title"].waitUntilExists(timeout: timeout), requestLog)
        XCTAssertTrue(app.buttons["classDate.menu"].exists, "the Owner's menu is still there")
        XCTAssertFalse(app.buttons["classDate.shareLink"].exists)
        let edit = app.buttons["classDate.edit"]
        XCTAssertTrue(app.buttons["classDate.menu"].tap(until: edit, timeout: timeout), requestLog)
        XCTAssertFalse(app.buttons["classDate.shareLinkMenu"].exists, "not in the menu either")
        XCTAssertTrue(server.bookingLinkRequests.isEmpty)
    }

    func test_F037_Unavailable_offlineBoekingslinkDelenIsOffAndSaysSo() throws {
        let (screen, server) = try launch(owner: true, opensClassDate: date, offline: true)
        let app = screen.app
        let share = app.buttons["classDate.shareLink"]
        XCTAssertTrue(share.waitUntilExists(timeout: timeout), requestLog)
        let offline = app.staticTexts["classDate.shareOffline"]
        XCTAssertTrue(offline.waitUntilExists(timeout: timeout), requestLog)
        XCTAssertEqual(offline.label, catalog["classes.app.shareLinkOffline"])
        XCTAssertFalse(share.isEnabled, "the button is off")
        let item = app.buttons["classDate.shareLinkMenu"]
        XCTAssertTrue(app.buttons["classDate.menu"].tap(until: item, timeout: timeout), requestLog)
        XCTAssertFalse(item.isEnabled, "the item is off")
        XCTAssertTrue(server.bookingLinkRequests.isEmpty, "nothing is queued")
    }
}

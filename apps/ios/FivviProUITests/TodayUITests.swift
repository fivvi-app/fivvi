import XCTest

/// TD-01 *Vandaag* (F013, iOS), in nl and en, against the stub server: Sarah's Tuesday 22 September 2026 at 08:35 (the app's
/// clock is fixed with `-UITestNow`), on the team of John's Gym and the owner of Sarah Personal Training (synthetic). The
/// app opens on Vandaag, as it does for a person.
@MainActor
final class TodayUITests: SignInUITestCase {
    private var catalog: TestCatalog { TestCatalog.configured }
    private var server: StubServer?
    private let johns = Responder.workspaceID(0)
    private let sarahTraining = Responder.workspaceID(1)

    private func launch(
        day: StubPersonalRoutes.Day = .sarah, twoWorkspaces: Bool = true, server existing: StubServer? = nil,
        session: AppLaunch.Session = .signedIn
    ) throws -> (XCUIApplication, StubServer) {
        let server = try existing ?? StubServer(signIn: StubServer.SignIn(
            email: "trainer@example.com", workspaceName: "John's Gym", role: "trainer",
            otherWorkspaces: twoWorkspaces ? [.init(name: "Sarah Personal Training", role: "owner")] : [],
            name: "Sarah Visser"
        ))
        server.personalDay = day
        self.server = server
        let app = AppLaunch.launch(
            against: server, session: session, startTab: nil, now: "2026-09-22T08:35:00+02:00"
        )
        return (app, server)
    }

    private func any(_ id: String, _ app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)[id].firstMatch
    }

    private var log: String { (server?.requests.map { "\($0.method) \($0.path)" } ?? []).joined(separator: "\n") }

    /// Sends the app to the background and brings it back, as a person returning to it.
    private func backgroundAndReopen(_ app: XCUIApplication) {
        XCUIDevice.shared.press(.home)
        _ = app.wait(for: .runningBackground, timeout: timeout)
        app.activate()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: timeout))
    }

    private func summary(_ done: String = "0", count: Int = 4, last: String = "19:00") -> String {
        String(format: catalog["myDay.app.summary"], count, done, "09:00", last)
    }

    func test_F013_AC1_todayShowsMyDayAcrossWorkspaces() throws {
        let (app, _) = try launch()

        let title = app.staticTexts["today.title"]
        XCTAssertTrue(title.waitUntilExists(timeout: timeout), log)
        XCTAssertEqual(title.label, catalog["myDay.app.title"])
        XCTAssertTrue(app.staticTexts["largeTitle.eyebrow"].exists, "the date above the title")
        XCTAssertTrue(app.staticTexts[summary()].exists, "the summary with the done count: \(summary())")
        XCTAssertTrue(app.staticTexts[String(format: catalog["myDay.nextUpcoming"], "25")].exists)
        let next = any("today.next", app)
        XCTAssertTrue(next.exists)
        XCTAssertTrue(app.staticTexts["Anna de Vries"].exists)
        XCTAssertTrue(app.buttons["today.next.open"].exists)
        let mark = app.buttons["today.row.\(StubPersonalRoutes.mark)"]
        XCTAssertTrue(mark.exists)
        XCTAssertTrue(mark.label.contains("Mark Jansen"), mark.label)
        XCTAssertTrue(mark.label.contains(catalog["myDay.typePrivate"].lowercased()), "the type is in the name")
        let cancelled = app.buttons["today.row.\(StubPersonalRoutes.krachtCancelled)"]
        XCTAssertTrue(cancelled.exists)
        XCTAssertTrue(cancelled.label.contains(catalog["myDay.cancelled"]), cancelled.label)
        XCTAssertFalse(app.buttons["today.row.\(StubPersonalRoutes.anna)"].exists, "the next item is not repeated")
    }

    func test_F013_AC2_workspaceLabelOnlyWithSeveralWorkspaces() throws {
        let (several, _) = try launch()
        XCTAssertTrue(several.staticTexts["today.title"].waitUntilExists(timeout: timeout), log)
        XCTAssertTrue(several.staticTexts["John's Gym"].exists, "every row names its workspace")
        let onNextCard = NSPredicate(format: "label CONTAINS %@", "Sarah Personal Training")
        XCTAssertTrue(several.staticTexts.matching(onNextCard).firstMatch.exists, "the next card too")
        several.terminate()

        let (solo, _) = try launch(day: .solo, twoWorkspaces: false)
        XCTAssertTrue(solo.staticTexts["today.title"].waitUntilExists(timeout: timeout), log)
        XCTAssertTrue(solo.buttons["today.row.\(StubPersonalRoutes.mark)"].waitUntilExists(timeout: timeout))
        XCTAssertFalse(solo.staticTexts["Sarah Personal Training"].exists)
        let mark = solo.buttons["today.row.\(StubPersonalRoutes.mark)"]
        let places = mark.label.components(separatedBy: "John's Gym").count - 1
        XCTAssertEqual(places, 1, "its place once, no workspace: \(mark.label)")
    }

    func test_F013_AC4_itemOpensInItsOwnWorkspace() throws {
        let (app, server) = try launch()
        let open = app.buttons["today.next.open"]
        XCTAssertTrue(open.waitUntilExists(timeout: timeout), log)

        open.tap()

        XCTAssertTrue(app.staticTexts["session.title"].waitUntilExists(timeout: timeout), log)
        XCTAssertTrue(
            server.requests.contains {
                $0.path == "/api/v1/workspaces/\(sarahTraining)/sessions/\(StubPersonalRoutes.anna)"
            },
            "TD-02 asks for the session in its own workspace\n\(log)"
        )
        let back = app.navigationBars.buttons.element(boundBy: 0)
        XCTAssertEqual(back.label, catalog["myDay.app.title"], "‹ Vandaag")
        back.tap()
        XCTAssertTrue(app.staticTexts["today.title"].waitUntilExists(timeout: timeout))

        app.buttons["today.row.\(StubPersonalRoutes.kracht)"].tap()
        XCTAssertTrue(app.staticTexts["classDate.title"].waitUntilExists(timeout: timeout), log)
        XCTAssertEqual(
            app.staticTexts["classDate.title"].label,
            TestCatalog.configuredLanguage.hasPrefix("en") ? "Strength" : "Kracht",
            "the class in the viewer's language"
        )

        app.tabBars.buttons["tab.home"].tap()
        let name = app.staticTexts["home.workspaceName"]
        XCTAssertTrue(name.waitUntilExists(timeout: timeout))
        XCTAssertEqual(name.label, "John's Gym", "the current workspace stays as it was")
    }

    func test_F013_AC5_theEmptyTextAndTheTomorrowLine() throws {
        let (app, _) = try launch(day: .empty)
        let empty = app.staticTexts["today.empty"]
        XCTAssertTrue(empty.waitUntilExists(timeout: timeout), log)
        XCTAssertTrue(empty.label.hasPrefix(String(catalog["myDay.emptyToday"].dropLast())), empty.label)
        XCTAssertTrue(app.staticTexts[catalog["myDay.app.summaryEmpty"]].exists)
        app.terminate()

        let (full, _) = try launch()
        let tomorrow = full.buttons["today.tomorrow"]
        XCTAssertTrue(tomorrow.waitUntilExists(timeout: timeout), log)
        XCTAssertEqual(tomorrow.label, String(format: catalog["myDay.tomorrow"], 3, "07:00"))
        tomorrow.tap()
        XCTAssertTrue(full.staticTexts["calendar.title"].waitUntilExists(timeout: timeout), "Agenda opens")
    }

    func test_F013_AC7_offlineShowsCachedDay() throws {
        let (app, server) = try launch()
        XCTAssertTrue(app.buttons["today.row.\(StubPersonalRoutes.mark)"].waitUntilExists(timeout: timeout), log)
        app.terminate()

        server.setOffline(true)
        let (offline, _) = try launch(server: server, session: .asLeft)

        XCTAssertTrue(offline.buttons["today.row.\(StubPersonalRoutes.mark)"].waitUntilExists(timeout: timeout), log)
        let banner = offline.staticTexts["today.offline"]
        XCTAssertTrue(banner.waitUntilExists(timeout: timeout))
        XCTAssertEqual(banner.label, String(format: catalog["myDay.app.offline"], "08:35"), "when the day was read")
        let plan = offline.buttons["today.card.plan"]
        XCTAssertTrue(plan.exists)
        XCTAssertFalse(plan.isEnabled, "actions that need the server are off")

        server.setOffline(false)
        backgroundAndReopen(offline)
        let gone = Polling.until(timeout: timeout, interval: 0.3) { !offline.staticTexts["today.offline"].exists }
        XCTAssertTrue(gone, log)
    }

    func test_F013_AC8_removedWorkspaceNoticeOnce() throws {
        let (app, server) = try launch()
        XCTAssertTrue(app.buttons["today.row.\(StubPersonalRoutes.mark)"].waitUntilExists(timeout: timeout), log)
        XCTAssertFalse(app.staticTexts["today.notice"].exists)

        server.removeFromTeam(workspace: 0)
        backgroundAndReopen(app)

        let notice = app.staticTexts["today.notice"]
        XCTAssertTrue(notice.waitUntilExists(timeout: timeout), log)
        XCTAssertEqual(notice.label, String(format: catalog["myDay.app.removed"], "John's Gym"))
        app.buttons["today.notice.dismiss"].tap()
        XCTAssertTrue(Polling.until(timeout: timeout, interval: 0.3) { !app.staticTexts["today.notice"].exists })
        backgroundAndReopen(app)
        XCTAssertFalse(app.staticTexts["today.notice"].waitUntilExists(timeout: 2), "it shows once")
    }

    func test_F013_design_theMijnDagCardAndTheNextCard() throws {
        let (app, server) = try launch()
        let gap = app.staticTexts["today.card.gap"]
        XCTAssertTrue(gap.waitUntilExists(timeout: timeout), log)
        XCTAssertEqual(gap.label, String(format: catalog["myDay.app.freeGap"], "12:00", "13:30"))
        let route = any("today.card.route", app)
        XCTAssertTrue(route.exists)
        XCTAssertTrue(route.label.contains("TrainMore Zuid → John's Gym"), route.label)
        XCTAssertTrue(app.buttons["today.next.open"].exists, "the gradient card has its button")

        app.buttons["today.card.plan"].tap()
        XCTAssertTrue(app.staticTexts["newSession.title"].waitUntilExists(timeout: timeout), log)
        let start = any("newSession.start", app)
        XCTAssertTrue(start.waitUntilExists(timeout: timeout))
        XCTAssertTrue(start.debugDescription.contains("12:00"), "PS-04 at the gap's start: \(start.debugDescription)")
        app.terminate()

        server.personalDay = .solo
        let (solo, _) = try launch(day: .solo, server: server)
        XCTAssertTrue(solo.staticTexts["today.card.gap"].waitUntilExists(timeout: timeout), log)
        XCTAssertFalse(any("today.card.route", solo).exists, "with one place left there is no route")
    }

    func test_F013_design_theKindLabelsAndThePillOnlyWhereThereAreClasses() throws {
        let (app, _) = try launch()
        let kracht = app.buttons["today.row.\(StubPersonalRoutes.kracht)"]
        XCTAssertTrue(kracht.waitUntilExists(timeout: timeout), log)
        XCTAssertTrue(app.staticTexts[catalog["myDay.typeGroup"]].exists)
        XCTAssertTrue(app.staticTexts[catalog["myDay.typePrivate"]].exists)
        XCTAssertTrue(app.staticTexts[String(format: catalog["myCalendar.blockBooked"], "0", "8")].exists)
        app.terminate()

        let (solo, _) = try launch(day: .solo, twoWorkspaces: false)
        XCTAssertTrue(solo.buttons["today.row.\(StubPersonalRoutes.mark)"].waitUntilExists(timeout: timeout), log)
        XCTAssertFalse(solo.staticTexts[catalog["myDay.typeGroup"]].exists)
        XCTAssertFalse(solo.staticTexts[catalog["myDay.typePrivate"]].exists, "one kind: no label")
        XCTAssertFalse(solo.staticTexts[String(format: catalog["myCalendar.blockBooked"], "0", "8")].exists)
    }
}

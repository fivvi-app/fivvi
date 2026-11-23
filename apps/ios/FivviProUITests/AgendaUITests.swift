import XCTest

/// TD-04 *Agenda* (F013, iOS), in nl and en, against the stub server: Sarah's Tuesday 22 September 2026 at 08:35 (the app's
/// clock is fixed with `-UITestNow`), who trains in John's Gym and Sarah Personal Training (synthetic), and for AC6 Thursday
/// 22 October 2026, in the week the clocks go back. The app opens on Vandaag; the tests open the second tab.
@MainActor
final class AgendaUITests: SignInUITestCase {
    private var catalog: TestCatalog { TestCatalog.configured }
    private var server: StubServer?
    private var isEnglish: Bool { TestCatalog.configuredLanguage.hasPrefix("en") }

    private func launch(
        now: String = "2026-09-22T08:35:00+02:00", day: StubPersonalRoutes.Day = .sarah,
        server existing: StubServer? = nil, session: AppLaunch.Session = .signedIn
    ) throws -> (XCUIApplication, StubServer) {
        let server = try existing ?? StubServer(signIn: StubServer.SignIn(
            email: "trainer@example.com", workspaceName: "John's Gym", role: "trainer",
            otherWorkspaces: [.init(name: "Sarah Personal Training", role: "owner")], name: "Sarah Visser"
        ))
        server.personalDay = day
        self.server = server
        return (AppLaunch.launch(against: server, session: session, startTab: nil, now: now), server)
    }

    /// Agenda, opened from the tab bar.
    private func openAgenda(
        now: String = "2026-09-22T08:35:00+02:00", day: StubPersonalRoutes.Day = .sarah
    ) throws -> (XCUIApplication, StubServer) {
        let (app, server) = try launch(now: now, day: day)
        let tab = app.tabBars.buttons["tab.calendar"]
        XCTAssertTrue(tab.waitUntilExists(timeout: timeout), log)
        tab.tap()
        XCTAssertTrue(app.staticTexts["calendar.title"].waitUntilExists(timeout: timeout), log)
        return (app, server)
    }

    private var log: String { (server?.requests.map { "\($0.method) \($0.path)" } ?? []).joined(separator: "\n") }

    private func any(_ id: String, _ app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)[id].firstMatch
    }

    private func mode(_ key: String, _ app: XCUIApplication) {
        let button = app.segmentedControls["calendar.mode"].buttons[catalog[key]]
        XCTAssertTrue(button.waitUntilExists(timeout: timeout), log)
        button.tap()
    }

    /// The strip's button of a day: it is selected when the list or the timeline is of that day.
    private func day(_ date: String, _ app: XCUIApplication) -> XCUIElement { app.buttons["calendar.day.\(date)"] }

    private func sessionsRequests(_ server: StubServer) -> Int { server.requests(to: "/api/v1/me/sessions").count }

    func test_F013_design_agendaOffersDagWeekAndMaandUnderTheTitleAndVandaagInTheBar() throws {
        let (app, _) = try openAgenda()

        XCTAssertEqual(app.staticTexts["calendar.title"].label, catalog["myCalendar.app.title"])
        let control = app.segmentedControls["calendar.mode"]
        XCTAssertTrue(control.waitUntilExists(timeout: timeout), log)
        XCTAssertTrue(control.buttons[catalog["myCalendar.viewDay"]].exists)
        XCTAssertTrue(control.buttons[catalog["myCalendar.viewWeek"]].exists)
        XCTAssertTrue(control.buttons[catalog["myCalendar.app.viewMonth"]].exists)
        XCTAssertTrue(control.buttons[catalog["myCalendar.viewWeek"]].isSelected, "the week is the first view")
        XCTAssertEqual(app.buttons["calendar.today"].label, catalog["myCalendar.today"], "Vandaag in the bar")
    }

    func test_F013_design_dagShowsTheDayAsATimelineWithTwoAtTheSameTimeSideBySideAndTheNowLine() throws {
        let (app, _) = try openAgenda()
        mode("myCalendar.viewDay", app)

        XCTAssertTrue(any("calendar.timeline", app).waitUntilExists(timeout: timeout), log)
        let mark = app.buttons["calendar.block.\(StubPersonalRoutes.mark)"]
        let lisa = app.buttons["calendar.block.\(StubPersonalRoutes.overlap)"]
        XCTAssertTrue(mark.exists, "Mark's session is a block of the timeline")
        XCTAssertTrue(lisa.exists, "and so is Lisa's, at the same time")
        XCTAssertEqual(mark.frame.minY, lisa.frame.minY, accuracy: 1, "at the same time")
        XCTAssertLessThanOrEqual(mark.frame.maxX, lisa.frame.minX + 1, "side by side")
        XCTAssertTrue(mark.label.contains("Mark Jansen"), mark.label)
        let anna = app.buttons["calendar.block.\(StubPersonalRoutes.anna)"]
        XCTAssertTrue(anna.exists)
        XCTAssertGreaterThan(anna.frame.width, mark.frame.width * 1.5, "alone it takes the width of the day")
        let now = any("calendar.now", app)
        XCTAssertTrue(now.exists, "the now-line is on today")
        XCTAssertEqual(now.label, String(format: catalog["myCalendar.app.now"], "08:35"))
        XCTAssertLessThan(now.frame.minY, anna.frame.minY, "08:35 is above the 09:00 session")
        let cancelled = app.buttons["calendar.block.\(StubPersonalRoutes.krachtCancelled)"]
        XCTAssertTrue(cancelled.exists)
        XCTAssertTrue(cancelled.label.contains(catalog["myDay.cancelled"]), "a cancelled block is marked")
    }

    func test_F013_design_theStripShowsOneDotPerSessionInItsTypesColourAtMostThree() throws {
        let (app, _) = try openAgenda()
        mode("myCalendar.viewDay", app)

        // 22 September: four sessions that take place (a cancelled one is not counted): three dots, and the count says four.
        let tuesday = any("calendar.dots.2026-09-22.private-private-private", app)
        XCTAssertTrue(tuesday.waitUntilExists(timeout: timeout), "private sessions are blue, three at most: \(log)")
        XCTAssertEqual(tuesday.label, String(format: catalog["myCalendar.app.dots"], 4))
        // 23 September: two private sessions and a class, which is a purple dot.
        let wednesday = any("calendar.dots.2026-09-23.private-private-group", app)
        XCTAssertTrue(wednesday.exists, "a class is the purple dot")
        XCTAssertEqual(wednesday.label, String(format: catalog["myCalendar.app.dots"], 3))
        let noDots = NSPredicate(format: "identifier BEGINSWITH %@", "calendar.dots.2026-09-21")
        let none = app.descendants(matching: .any).matching(noDots).firstMatch
        XCTAssertFalse(none.exists, "a day without sessions has none")
        XCTAssertTrue(day("2026-09-22", app).isSelected, "the selected day is marked")
        XCTAssertGreaterThanOrEqual(day("2026-09-22", app).frame.height, 44, "a day is touched on at least 44 pt")
        XCTAssertGreaterThanOrEqual(day("2026-09-22", app).frame.width, 44)
    }

    func test_F013_AC15_aWeekRendersFromOneRequest() throws {
        let (app, server) = try openAgenda()

        XCTAssertTrue(app.buttons["calendar.row.\(StubPersonalRoutes.anna)"].waitUntilExists(timeout: timeout), log)
        XCTAssertEqual(sessionsRequests(server), 1, "the seven days of the week are one request: \(log)")

        day("2026-09-23", app).tap()
        day("2026-09-24", app).tap()
        mode("myCalendar.viewDay", app)
        XCTAssertFalse(app.buttons["calendar.block.\(StubPersonalRoutes.tomorrowEarly)"].exists, "not on the 24th")
        day("2026-09-23", app).tap()
        let early = app.buttons["calendar.block.\(StubPersonalRoutes.tomorrowEarly)"]
        XCTAssertTrue(early.waitUntilExists(timeout: timeout), log)
        mode("myCalendar.viewWeek", app)
        XCTAssertEqual(sessionsRequests(server), 1, "no request per day, and none for the other view of the same days")
    }

    func test_F013_AC5_theTomorrowLineOpensAgendaOnThatDay() throws {
        let (app, _) = try launch()
        let tomorrow = app.buttons["today.tomorrow"]
        XCTAssertTrue(tomorrow.waitUntilExists(timeout: timeout), log)
        XCTAssertEqual(tomorrow.label, String(format: catalog["myDay.tomorrow"], 3, "07:00"))

        tomorrow.tap()

        XCTAssertTrue(app.staticTexts["calendar.title"].waitUntilExists(timeout: timeout), "Agenda opens: \(log)")
        XCTAssertTrue(day("2026-09-23", app).waitUntilExists(timeout: timeout))
        XCTAssertTrue(day("2026-09-23", app).isSelected, "on 23 September")
        let stub = StubPersonalRoutes.self
        let three = [stub.tomorrowEarly, stub.tomorrowMid, stub.tomorrowEvening]
        for id in three {
            let row = app.buttons["calendar.row.\(id)"]
            XCTAssertTrue(row.waitUntilExists(timeout: timeout), "its three sessions: \(log)")
        }
        let first = app.buttons["calendar.row.\(StubPersonalRoutes.tomorrowEarly)"]
        XCTAssertTrue(first.label.contains("07:00"), first.label)
        XCTAssertTrue(app.tabBars.buttons["tab.calendar"].isSelected)
    }

    func test_F013_AC6_calendarWeekAndMonthWithDstNote() throws {
        let (app, _) = try openAgenda(now: "2026-10-22T08:35:00+02:00")

        // The week of 19-25 October: dots on the busy days and the note of the day the clocks go back.
        let note = app.staticTexts["calendar.clockNote"]
        XCTAssertTrue(note.waitUntilExists(timeout: timeout), log)
        let sunday = isEnglish ? "Sun 25 Oct" : "zo 25 okt"
        XCTAssertEqual(note.label, String(format: catalog["myCalendar.app.clockBack"], sunday))
        XCTAssertTrue(any("calendar.dots.2026-10-20.group", app).exists, "Tuesday's class is a dot")
        XCTAssertTrue(any("calendar.dots.2026-10-22.private", app).exists, "and Thursday's session")
        XCTAssertFalse(any("calendar.dots.2026-10-21.private", app).exists, "an empty day has none")
        let weekLine = app.staticTexts["calendar.weekLine"]
        XCTAssertTrue(weekLine.label.hasPrefix("Week 43 · "), weekLine.label)

        // The weekly class is at 18:00 on 20 October and on 27 October.
        let kracht = app.buttons["calendar.row.\(StubPersonalRoutes.krachtOctober20)"]
        XCTAssertTrue(kracht.waitUntilExists(timeout: timeout), log)
        let spoken = String(format: catalog["myCalendar.spokenTime"], "19:00", "18:00")
        XCTAssertTrue(kracht.label.contains(spoken), kracht.label)
        app.buttons["calendar.next"].tap()
        let next = app.buttons["calendar.row.\(StubPersonalRoutes.krachtOctober27)"]
        XCTAssertTrue(next.waitUntilExists(timeout: timeout), log)
        XCTAssertTrue(next.label.contains(spoken), next.label)
        XCTAssertFalse(app.staticTexts["calendar.clockNote"].exists, "the next week has no note")

        // The month of October 2026: Monday first, days of other months dimmed.
        mode("myCalendar.app.viewMonth", app)
        XCTAssertTrue(app.staticTexts["calendar.monthTitle"].waitUntilExists(timeout: timeout), log)
        XCTAssertTrue(day("2026-09-28", app).exists, "the grid starts on Monday 28 September")
        XCTAssertTrue(day("2026-11-01", app).exists, "and ends on Sunday 1 November")
        XCTAssertFalse(day("2026-09-27", app).exists)
        XCTAssertFalse(day("2026-11-02", app).exists)
        XCTAssertTrue(day("2026-10-25", app).exists)
        let monday = day("2026-09-28", app), tuesday = day("2026-09-29", app)
        XCTAssertLessThan(monday.frame.minX, tuesday.frame.minX, "Monday is the first column")
        XCTAssertEqual(day("2026-09-28", app).frame.minX, day("2026-10-05", app).frame.minX, accuracy: 1)
        XCTAssertEqual(
            app.staticTexts["calendar.clockNote"].label, String(format: catalog["myCalendar.app.clockBack"], sunday),
            "the note is on the month too"
        )
        XCTAssertEqual(app.buttons["calendar.previousMonth"].label, catalog["myCalendar.app.previousMonth"])
        XCTAssertEqual(app.buttons["calendar.nextMonth"].label, catalog["myCalendar.app.nextMonth"])
    }

    func test_F013_design_weekListsTheSevenDaysAndAnEmptyDaySaysSo() throws {
        let (app, _) = try openAgenda()

        XCTAssertTrue(app.buttons["calendar.row.\(StubPersonalRoutes.anna)"].waitUntilExists(timeout: timeout), log)
        let empty = app.staticTexts["calendar.empty.2026-09-21"]
        XCTAssertTrue(empty.exists)
        XCTAssertEqual(empty.label, catalog["myCalendar.emptyDay"], "Geen sessies op deze dag.")
        let heading = app.staticTexts["calendar.heading.2026-09-22"]
        let name = isEnglish ? "Tuesday 22 September" : "dinsdag 22 september"
        XCTAssertEqual(
            heading.label.lowercased(), String(format: catalog["myCalendar.app.todayHeading"], name).lowercased(),
            "Vandaag · dinsdag 22 september"
        )
        XCTAssertTrue(app.staticTexts["calendar.heading.2026-09-23"].exists, "a day each")
        XCTAssertTrue(app.buttons["calendar.row.\(StubPersonalRoutes.mark)"].exists)
    }

    func test_F013_design_maandShowsTheListOfTheTappedDayUnderTheGrid() throws {
        let (app, _) = try openAgenda()
        mode("myCalendar.app.viewMonth", app)

        XCTAssertTrue(any("calendar.grid", app).waitUntilExists(timeout: timeout), log)
        let anna = app.buttons["calendar.row.\(StubPersonalRoutes.anna)"]
        XCTAssertTrue(anna.waitUntilExists(timeout: timeout), "today's list: \(log)")
        day("2026-09-23", app).tap()
        let early = app.buttons["calendar.row.\(StubPersonalRoutes.tomorrowEarly)"]
        XCTAssertTrue(early.waitUntilExists(timeout: timeout), log)
        day("2026-09-24", app).tap()
        let empty = app.staticTexts["calendar.empty"]
        XCTAssertTrue(empty.waitUntilExists(timeout: timeout))
        XCTAssertEqual(empty.label, catalog["myCalendar.emptyDay"])
    }

    func test_F013_design_vandaagJumpsBackToToday() throws {
        let (app, _) = try openAgenda()
        app.buttons["calendar.next"].tap()
        XCTAssertFalse(day("2026-09-22", app).waitUntilExists(timeout: 1))

        app.buttons["calendar.today"].tap()

        XCTAssertTrue(day("2026-09-22", app).waitUntilExists(timeout: timeout))
        XCTAssertTrue(day("2026-09-22", app).isSelected)
    }

    func test_F013_AC4_aSessionOpensInItsOwnWorkspaceAndBackReturnsToAgenda() throws {
        let (app, server) = try openAgenda()
        let anna = app.buttons["calendar.row.\(StubPersonalRoutes.anna)"]
        XCTAssertTrue(anna.waitUntilExists(timeout: timeout), log)

        anna.tap()

        XCTAssertTrue(app.staticTexts["session.title"].waitUntilExists(timeout: timeout), log)
        XCTAssertTrue(
            server.requests.contains {
                $0.path == "/api/v1/workspaces/\(Responder.workspaceID(1))/sessions/\(StubPersonalRoutes.anna)"
            },
            "TD-02 asks for the session in its own workspace\n\(log)"
        )
        let back = app.navigationBars.buttons.element(boundBy: 0)
        XCTAssertEqual(back.label, catalog["myCalendar.app.title"], "‹ Agenda")
        back.tap()
        XCTAssertTrue(app.staticTexts["calendar.title"].waitUntilExists(timeout: timeout))
    }
}

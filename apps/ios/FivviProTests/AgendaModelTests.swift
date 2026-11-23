import FivviAPI
import XCTest

@testable import FivviPro
@testable import FivviStrings
@testable import FivviLanguage

/// TD-04 *Agenda* (F013 AC5, AC6, AC15 and the design of `DECISIONS.md` §3, iOS): the week and the month as
/// `GET /api/v1/me/sessions` answers them. The test plan runs every test in nl and en (FivviPro.xctestplan).
@MainActor
final class AgendaModelTests: AgendaTestCase {
    /// 22 September 2026 is a Tuesday: the week of Monday 21 to Sunday 27.
    func test_F013_AC15_aWeekRendersFromOneRequest() async {
        let api = served()
        let agenda = model(api)
        XCTAssertEqual(agenda.state, .loading)

        await agenda.load()

        XCTAssertEqual(agenda.state, .loaded)
        XCTAssertEqual(api.mySessions.queries.map(\.from), ["2026-09-21"])
        XCTAssertEqual(api.mySessions.queries.map(\.to), ["2026-09-27"])
        XCTAssertEqual(api.mySessions.queries.map(\.surface), [.ios], "the API records the view of the calendar")
        XCTAssertEqual(agenda.strip.map(\.day).count, 7)
        XCTAssertEqual(agenda.weekSections.map(\.rows.count), [0, 4, 3, 0, 0, 0, 0])

        agenda.select("2026-09-24")
        agenda.show(.day)
        agenda.show(.week)
        XCTAssertEqual(agenda.rangeKey, AgendaModel.Range(from: "2026-09-21", until: "2026-09-27"))
        XCTAssertEqual(api.mySessions.queries.count, 1, "no request per day, no request for the view of the same days")
    }

    func test_F013_AC15_theMonthIsOneRequestForTheDaysOfItsGrid() async {
        let api = served()
        let agenda = model(api)
        agenda.show(.month)

        await agenda.load()

        XCTAssertEqual(api.mySessions.queries.map(\.from), ["2026-08-31"], "1 September 2026 is a Tuesday")
        XCTAssertEqual(api.mySessions.queries.map(\.to), ["2026-10-04"])
        XCTAssertEqual(agenda.grid.count, 35)
        XCTAssertEqual(agenda.grid.first { $0.day == "2026-09-22" }?.count, 3)
    }

    func test_F013_design_theStripShowsOneDotPerSessionInItsTypesColourAtMostThree() async {
        let agenda = model(served())
        await agenda.load()

        let tuesday = agenda.strip.first { $0.day == "2026-09-22" }
        XCTAssertEqual(tuesday?.dots, [.privateSession, .privateSession, .group], "the cancelled class is not counted")
        XCTAssertEqual(tuesday?.count, 3)
        XCTAssertEqual(agenda.strip.first { $0.day == "2026-09-23" }?.dots, [.privateSession, .privateSession, .group])
        XCTAssertEqual(agenda.strip.first { $0.day == "2026-09-21" }?.dots, [])

        let busy = (0..<5).map {
            PersonalFixtures.session(
                "busy\($0)", PersonalFixtures.johns, from: "0\($0 + 6):00", to: "0\($0 + 6):30", client: "Mark Jansen",
                day: "2026-09-25"
            )
        }
        let crowded = model(served(busy))
        await crowded.load()
        let friday = crowded.strip.first { $0.day == "2026-09-25" }
        XCTAssertEqual(friday?.dots.count, 3, "at most three dots")
        XCTAssertEqual(friday?.count, 5, "the spoken count is the real one")
    }

    func test_F013_design_theStripIsMondayFirstWithTodayAndTheSelectedDayMarked() async {
        let agenda = model(served())
        agenda.select("2026-09-24")
        await agenda.load()

        XCTAssertEqual(agenda.strip.map(\.number), [21, 22, 23, 24, 25, 26, 27])
        XCTAssertEqual(agenda.strip.filter(\.isToday).map(\.day), ["2026-09-22"])
        XCTAssertEqual(agenda.strip.filter(\.isSelected).map(\.day), ["2026-09-24"])
        let letters = language == .nlNL ? ["M", "D", "W", "D", "V", "Z", "Z"] : ["M", "T", "W", "T", "F", "S", "S"]
        XCTAssertEqual(agenda.strip.map(\.weekday), letters, "the weekday letters, Monday first")
    }

    func test_F013_design_theLineUnderTheStripNamesTheWeekAndItsDays() async {
        let agenda = model(served())
        await agenda.load()

        let range = String(
            format: catalog["myCalendar.range"], format.dayMonthYear(PersonalFixtures.at("12:00", "2026-09-27")),
            format.dayMonth(PersonalFixtures.at("12:00", "2026-09-21"))
        )
        XCTAssertEqual(agenda.weekLine, String(format: catalog["myCalendar.app.weekLine"], range, "39"))
        XCTAssertTrue(agenda.weekLine.hasPrefix("Week 39 · "), agenda.weekLine)
    }

    func test_F013_AC5_openingOnTomorrowSelectsTheDay() async {
        let api = served()
        let agenda = model(api)
        await agenda.load()

        agenda.open(day: "2026-09-23")

        XCTAssertEqual(agenda.selectedDay, "2026-09-23")
        XCTAssertEqual(agenda.rows(on: "2026-09-23").map(\.startText), ["07:00", "10:00", "17:00"])
        XCTAssertEqual(agenda.selectedRows.map(\.startText), ["07:00", "10:00", "17:00"], "first at 07:00")
        XCTAssertEqual(api.mySessions.queries.count, 1, "tomorrow is in the week on screen")
    }

    func test_F013_AC5_openingOnTomorrowShowsTheWeekWhateverViewWasOpen() async {
        let agenda = model(served())
        agenda.show(.month)

        agenda.open(day: "2026-09-23")

        XCTAssertEqual(agenda.mode, .week, "Morgen opens the week view, as the prototype does")
        XCTAssertEqual(agenda.selectedDay, "2026-09-23")
        agenda.show(.day)
        agenda.open(day: "2026-09-23")
        XCTAssertEqual(agenda.mode, .week, "from Dag too")
    }

    func test_F013_AC5_aDayInAnotherWeekReadsThatWeek() async {
        let api = served()
        let agenda = model(api)
        await agenda.load()

        agenda.open(day: "2026-09-29")

        XCTAssertEqual(agenda.rangeKey, AgendaModel.Range(from: "2026-09-28", until: "2026-10-04"))
        await agenda.load()
        XCTAssertEqual(api.mySessions.queries.map(\.from), ["2026-09-21", "2026-09-28"])
    }

    /// 19–25 October 2026 is the week the clocks go back, in the night to Sunday 25 October.
    func test_F013_AC6_calendarWeekAndMonthWithDstNote() async throws {
        let api = served(PersonalFixtures.octoberWeeks)
        let agenda = model(api, now: PersonalFixtures.at("08:35", "2026-10-22"))
        agenda.select("2026-10-22")
        await agenda.load()

        // The week strip: dots on the busy days and the note of the day the clocks change.
        XCTAssertEqual(agenda.strip.map(\.day).first, "2026-10-19")
        XCTAssertEqual(agenda.strip.map(\.day).last, "2026-10-25")
        XCTAssertEqual(agenda.strip.map { !$0.dots.isEmpty }, [false, true, false, true, false, false, false])
        let sunday = format.day(PersonalFixtures.at("12:00", "2026-10-25"))
        XCTAssertEqual(agenda.clockNotes, [String(format: catalog["myCalendar.app.clockBack"], sunday)])
        XCTAssertTrue(sunday.hasPrefix(language == .nlNL ? "zo" : "Sun"), sunday)

        // A weekly class at 18:00 shows at 18:00 on 20 October and on 27 October, across the change of the clocks.
        XCTAssertEqual(agenda.rows(on: "2026-10-20").map(\.startText), ["18:00"])
        agenda.stepWeek(1)
        await agenda.load()
        XCTAssertEqual(agenda.rows(on: "2026-10-27").map(\.startText), ["18:00"])
        XCTAssertEqual(agenda.clockNotes, [], "the next week has no note")

        // The month: October 2026 Monday first, with the days of other months dimmed.
        agenda.show(.month)
        await agenda.load()
        XCTAssertEqual(agenda.grid.first?.day, "2026-09-28")
        XCTAssertEqual(agenda.grid.last?.day, "2026-11-01")
        XCTAssertEqual(agenda.grid.filter(\.isOutsideMonth).map(\.number), [28, 29, 30, 1])
        XCTAssertEqual(agenda.grid.count, 35)
        XCTAssertEqual(agenda.clockNotes, [String(format: catalog["myCalendar.app.clockBack"], sunday)])
        let october = format.monthYear(PersonalFixtures.at("12:00", "2026-10-27"))
        XCTAssertEqual(agenda.monthTitle.lowercased(), october.lowercased())
    }

    func test_F013_AC6_theSpringChangeHasItsOwnNote() async {
        let api = served([])
        let agenda = model(api, now: PersonalFixtures.at("08:35", "2026-03-26"))
        agenda.select("2026-03-26")
        await agenda.load()

        let sunday = format.day(PersonalFixtures.at("12:00", "2026-03-29"))
        XCTAssertEqual(agenda.clockNotes, [String(format: catalog["myCalendar.app.clockForward"], sunday)])
    }

    func test_F013_AC6_aMonthIsSteppedWithItsGridRange() async {
        let api = served()
        let agenda = model(api)
        agenda.show(.month)
        await agenda.load()

        agenda.stepMonth(1)
        await agenda.load()
        XCTAssertEqual(agenda.selectedDay, "2026-10-22")
        XCTAssertEqual(api.mySessions.queries.last?.from, "2026-09-28")
        XCTAssertEqual(api.mySessions.queries.last?.to, "2026-11-01")

        agenda.stepMonth(-2)
        XCTAssertEqual(agenda.selectedDay, "2026-08-22")
        XCTAssertEqual(agenda.previousMonthLabel, catalog["myCalendar.app.previousMonth"])
        XCTAssertEqual(agenda.nextMonthLabel, catalog["myCalendar.app.nextMonth"])
    }

    func test_F013_design_aWeekIsSteppedByASevenDays() async {
        let agenda = model(served())
        await agenda.load()

        agenda.stepWeek(-1)
        XCTAssertEqual(agenda.selectedDay, "2026-09-15")
        XCTAssertEqual(agenda.rangeKey, AgendaModel.Range(from: "2026-09-14", until: "2026-09-20"))
        agenda.goToToday()
        XCTAssertEqual(agenda.selectedDay, "2026-09-22", "Vandaag jumps back")
        XCTAssertEqual(agenda.rangeKey, AgendaModel.Range(from: "2026-09-21", until: "2026-09-27"))
        XCTAssertEqual(agenda.previousWeekLabel, catalog["myCalendar.app.previousWeek"])
        XCTAssertEqual(agenda.nextWeekLabel, catalog["myCalendar.app.nextWeek"])
    }

    func test_F013_design_theWeekListHasADayEachAndTodayIsNamed() async {
        let agenda = model(served())
        await agenda.load()

        let sections = agenda.weekSections
        XCTAssertEqual(sections.map(\.day), agenda.strip.map(\.day))
        let today = sections[1]
        XCTAssertEqual(
            today.heading,
            String(format: catalog["myCalendar.app.todayHeading"], format.weekdayDay(PersonalFixtures.at("12:00")))
        )
        XCTAssertEqual(sections[2].heading, format.weekdayDay(PersonalFixtures.at("12:00", "2026-09-23")))
        XCTAssertEqual(today.rows.map(\.title), ["Anna de Vries", "Mark Jansen", "Kracht", "Kracht"])
        XCTAssertEqual(sections[0].emptyText, catalog["myCalendar.emptyDay"], "Geen sessies op deze dag.")
        XCTAssertNil(today.emptyText)
        XCTAssertEqual(agenda.emptyText, nil, "the selected day has sessions")
        agenda.select("2026-09-21")
        XCTAssertEqual(agenda.emptyText, catalog["myCalendar.emptyDay"])
    }

    func test_F013_design_aRowIsTD01sRowWithTheTypeLabelOnlyWhenThereAreSeveralKinds() async {
        let agenda = model(served())
        await agenda.load()

        let rows = agenda.rows(on: "2026-09-22")
        XCTAssertEqual(rows.map(\.title), ["Anna de Vries", "Mark Jansen", "Kracht", "Kracht"], "in time order")
        XCTAssertEqual(rows.first?.typeLabel, catalog["myDay.typePrivate"])
        XCTAssertEqual(rows.last?.isCancelled, true)
        XCTAssertEqual(rows.first?.workspaceLabel, "Sarah Personal Training", "two workspaces: every row names its own")

        let solo = model(served([PersonalFixtures.anna], workspaceCount: 1))
        await solo.load()
        XCTAssertNil(solo.rows(on: "2026-09-22").first?.typeLabel, "one kind: no label")
        XCTAssertNil(solo.rows(on: "2026-09-22").first?.workspaceLabel)
    }

    func test_F013_design_openGymIsNotShown() async {
        let gym = PersonalFixtures.openGym
        let agenda = model(served([PersonalFixtures.anna, gym]))
        await agenda.load()

        XCTAssertEqual(agenda.rows(on: "2026-09-22").map(\.title), ["Anna de Vries"])
        XCTAssertEqual(agenda.strip.first { $0.day == "2026-09-22" }?.dots, [.privateSession])
    }
}

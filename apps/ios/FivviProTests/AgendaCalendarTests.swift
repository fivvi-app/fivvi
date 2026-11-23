import XCTest

@testable import FivviPro

/// The days of Agenda (TD-04, F013 AC6): weeks and month grids Monday first, the ISO week number and the days the clocks
/// change, all by the wall clock of Dutch time (ADR-012).
final class AgendaCalendarTests: XCTestCase {
    private let calendar = AgendaCalendar(timeZone: PersonalRows.timeZone)

    func test_F013_AC6_aWeekIsMondayFirst() {
        XCTAssertEqual(
            calendar.week(of: "2026-10-22"),
            ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"]
        )
        XCTAssertEqual(calendar.week(of: "2026-10-25").first, "2026-10-19", "a Sunday ends its week")
        XCTAssertEqual(calendar.week(of: "2026-10-26").first, "2026-10-26", "a Monday starts it")
    }

    func test_F013_AC6_theWeekNumberIsTheISOWeek() {
        XCTAssertEqual(calendar.weekNumber(of: "2026-10-22"), 43)
        XCTAssertEqual(calendar.weekNumber(of: "2026-09-22"), 39)
        XCTAssertEqual(calendar.weekNumber(of: "2027-01-01"), 53, "1 January 2027 is in the last week of 2026")
        XCTAssertEqual(calendar.weekNumber(of: "2026-12-28"), 53)
    }

    func test_F013_AC6_theMonthGridIsMondayFirstAndCoversWholeWeeks() {
        let october = calendar.monthGrid(of: "2026-10-14")
        XCTAssertEqual(october.first, "2026-09-28", "1 October 2026 is a Thursday, so Monday 28 September")
        XCTAssertEqual(october.last, "2026-11-01", "and ends on the Sunday")
        XCTAssertEqual(october.count, 35)
        XCTAssertEqual(october.filter { calendar.isInMonth($0, of: "2026-10-14") }.count, 31)

        let march = calendar.monthGrid(of: "2026-03-10")
        XCTAssertEqual(march.first, "2026-02-23")
        XCTAssertEqual(march.last, "2026-04-05")
        XCTAssertEqual(march.count, 42, "six rows at most: the 42 days of a request")
    }

    func test_F013_AC6_aMonthWithFourRowsHasFour() {
        let february = calendar.monthGrid(of: "2027-02-10")
        XCTAssertEqual(february.first, "2027-02-01")
        XCTAssertEqual(february.last, "2027-02-28")
        XCTAssertEqual(february.count, 28)
    }

    func test_F013_AC6_daysAreAddedByTheWallClockAcrossTheChangeOfTheClocks() {
        XCTAssertEqual(calendar.adding(days: 1, to: "2026-10-24"), "2026-10-25")
        XCTAssertEqual(calendar.adding(days: 1, to: "2026-10-25"), "2026-10-26", "the 25-hour day is one day")
        XCTAssertEqual(calendar.adding(days: 1, to: "2026-03-28"), "2026-03-29")
        XCTAssertEqual(calendar.adding(days: 1, to: "2026-03-29"), "2026-03-30", "the 23-hour day is one day")
        XCTAssertEqual(calendar.adding(days: -7, to: "2026-10-26"), "2026-10-19")
        XCTAssertEqual(calendar.adding(days: 1, to: "2026-12-31"), "2027-01-01")
    }

    func test_F013_AC6_aMonthIsMovedByKeepingTheDayOfTheMonthWhenThereIsOne() {
        XCTAssertEqual(calendar.adding(months: 1, to: "2026-09-22"), "2026-10-22")
        XCTAssertEqual(calendar.adding(months: -1, to: "2026-10-22"), "2026-09-22")
        XCTAssertEqual(calendar.adding(months: 1, to: "2026-01-31"), "2026-02-28", "February has no 31st")
        XCTAssertEqual(calendar.adding(months: 1, to: "2026-12-15"), "2027-01-15")
    }

    func test_F013_AC6_theDaysTheClocksChangeAreFound() {
        XCTAssertEqual(calendar.clockChange(on: "2026-10-25"), .back, "autumn 2026: 03:00 becomes 02:00")
        XCTAssertEqual(calendar.clockChange(on: "2026-03-29"), .forward, "spring 2026: 02:00 becomes 03:00")
        XCTAssertNil(calendar.clockChange(on: "2026-10-24"))
        XCTAssertNil(calendar.clockChange(on: "2026-10-26"))
        XCTAssertNil(calendar.clockChange(on: "2026-09-22"))
    }

    func test_F013_AC6_aWeekOfFewerOrMoreHoursIsFound() {
        XCTAssertEqual(calendar.clockChanges(in: calendar.week(of: "2026-10-22")).map(\.day), ["2026-10-25"])
        XCTAssertEqual(calendar.clockChanges(in: calendar.week(of: "2026-09-22")).count, 0)
        let month = calendar.clockChanges(in: calendar.monthGrid(of: "2026-10-14"))
        XCTAssertEqual(month.map(\.day), ["2026-10-25"])
    }

    func test_F013_AC6_theLocalDayOfAnInstantIsDutchTime() {
        let lateInTheEvening = PersonalFixtures.at("23:30", "2026-10-24")
        XCTAssertEqual(calendar.day(of: lateInTheEvening), "2026-10-24", "23:30 in Amsterdam, which is 21:30 UTC")
        let justAfterMidnight = PersonalFixtures.at("00:15", "2026-10-25")
        XCTAssertEqual(calendar.day(of: justAfterMidnight), "2026-10-25")
    }
}

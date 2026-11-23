import FivviAPI
import XCTest

@testable import FivviPro
@testable import FivviStrings
@testable import FivviLanguage

/// The timeline of *Dag* on Agenda (TD-04, `DECISIONS.md` §3): an hour a row, each session a block in its type's colour,
/// sessions at the same time side by side, and the now-line on today. Only where a block sits is decided here.
final class AgendaTimelineTests: XCTestCase {
    private let calendar = AgendaCalendar(timeZone: PersonalRows.timeZone)
    private let catalog = Catalog(locale: InterfaceLanguage.resolve(.system()))
    /// A day that is not the day of `PersonalFixtures.now`, so there is no now-line on it.
    private let elsewhere = PersonalFixtures.at("08:35", "2026-09-30")

    private func timeline(_ items: [PersonalItem], now: Date = PersonalFixtures.now, day: String = PersonalFixtures.day)
        -> AgendaTimeline? {
        let rows = PersonalRows(items: items, workspaceCount: 2, catalog: catalog, now: now)
        let entries = items.map { AgendaTimeline.Entry(row: rows.row($0), startsAt: $0.startsAt, endsAt: $0.endsAt) }
        return AgendaTimeline.make(entries: entries, day: day, now: now, calendar: calendar)
    }

    /// A private session of John's Gym.
    private func visit(
        _ id: String, _ start: String, _ end: String, client: String = "Eva Kok", day: String = PersonalFixtures.day
    ) -> PersonalItem {
        PersonalFixtures.session(id, PersonalFixtures.johns, from: start, to: end, client: client, day: day)
    }

    private func blocks(_ timeline: AgendaTimeline) -> [String: AgendaTimeline.Block] {
        Dictionary(uniqueKeysWithValues: timeline.blocks.map { ($0.row.id, $0) })
    }

    func test_F013_design_theHoursRunFromTheFirstToTheLastHourOfTheDay() throws {
        let day = [PersonalFixtures.mark, PersonalFixtures.kracht]
        let timeline = try XCTUnwrap(timeline(day, now: elsewhere))

        XCTAssertEqual(timeline.hours, (11...16).map { String(format: "%02d:00", $0) })
        XCTAssertEqual(timeline.blocks.map(\.row.id), ["mark", "kracht"])
        XCTAssertEqual(timeline.blocks[0].top, 0, "11:00 is the first row")
        XCTAssertEqual(timeline.blocks[0].length, 60)
        XCTAssertEqual(timeline.blocks[1].top, 4 * 60, "15:00 is four hours down")
    }

    func test_F013_design_aSessionOfHalfAnHourIsPlacedByMinutes() throws {
        let timeline = try XCTUnwrap(timeline([visit("short", "09:15", "09:45")], now: elsewhere))

        XCTAssertEqual(timeline.hours, ["09:00", "10:00"])
        XCTAssertEqual(timeline.blocks[0].top, 15)
        XCTAssertEqual(timeline.blocks[0].length, 30)
    }

    func test_F013_design_twoSessionsAtTheSameTimeSitSideBySide() throws {
        let lisa = visit("lisa", "11:00", "12:00", client: "Lisa Smit")
        let day = [PersonalFixtures.anna, PersonalFixtures.mark, lisa, PersonalFixtures.kracht]
        let byID = blocks(try XCTUnwrap(timeline(day)))

        XCTAssertEqual([byID["mark"]?.column, byID["lisa"]?.column], [0, 1])
        XCTAssertEqual([byID["mark"]?.columns, byID["lisa"]?.columns], [2, 2])
        XCTAssertEqual([byID["anna"]?.column, byID["anna"]?.columns], [0, 1], "a session on its own takes the width")
        XCTAssertEqual([byID["kracht"]?.column, byID["kracht"]?.columns], [0, 1])
    }

    func test_F013_design_aChainOfOverlapsSharesOneWidthAndAFreeColumnIsUsedAgain() throws {
        let day = [visit("one", "09:00", "10:00"), visit("two", "09:30", "10:30"), visit("three", "10:15", "11:00")]
        let byID = blocks(try XCTUnwrap(timeline(day + [visit("next", "11:00", "12:00")])))

        XCTAssertEqual(byID["one"]?.column, 0)
        XCTAssertEqual(byID["two"]?.column, 1)
        XCTAssertEqual(byID["three"]?.column, 0, "the first one has ended")
        XCTAssertEqual([byID["one"]?.columns, byID["two"]?.columns, byID["three"]?.columns], [2, 2, 2])
        XCTAssertEqual(
            [byID["next"]?.column, byID["next"]?.columns], [0, 1], "one that starts as the last ends is alone"
        )
    }

    func test_F013_design_theNowLineIsOnTodayAndTheRowsReachIt() throws {
        // 08:35, before the first session at 09:00: the rows start at 08:00 so the line is on them.
        let sarah = [
            PersonalFixtures.anna, PersonalFixtures.mark, PersonalFixtures.kracht, PersonalFixtures.krachtCancelled
        ]
        let today = try XCTUnwrap(timeline(sarah))

        XCTAssertEqual(today.hours.first, "08:00")
        XCTAssertEqual(today.hours.last, "19:00")
        XCTAssertEqual(today.nowMinutes, 35)

        let later = try XCTUnwrap(timeline([PersonalFixtures.anna], now: PersonalFixtures.at("21:10")))
        XCTAssertEqual(later.hours.last, "22:00", "after the last session the rows reach the hour of now")
        XCTAssertEqual(later.nowMinutes, (21 - 9) * 60 + 10)

        let other = try XCTUnwrap(timeline([visit("other", "09:00", "10:00", day: "2026-09-23")], day: "2026-09-23"))
        XCTAssertNil(other.nowMinutes, "a day that is not today has no now-line")
        XCTAssertEqual(other.hours.first, "09:00", "and its rows are those of its sessions")
    }

    func test_F013_design_aCancelledSessionKeepsItsBlockMarked() throws {
        let timeline = try XCTUnwrap(timeline([PersonalFixtures.krachtCancelled], now: elsewhere))

        XCTAssertEqual(timeline.blocks.count, 1)
        XCTAssertTrue(timeline.blocks[0].row.isCancelled)
    }

    func test_F013_design_aDayWithoutSessionsHasNoTimeline() {
        XCTAssertNil(timeline([]))
    }

    func test_F013_AC6_aSessionIsPlacedByItsWallClockOnTheDayTheClocksChange() throws {
        // 25 October 2026 is 25 hours long: 18:00 is still 18:00 on the wall clock.
        let dst = visit("dst", "18:00", "19:00", day: "2026-10-25")
        let timeline = try XCTUnwrap(timeline([dst], now: elsewhere, day: "2026-10-25"))

        XCTAssertEqual(timeline.hours.first, "18:00")
        XCTAssertEqual(timeline.blocks[0].length, 60)
    }

    /// A block of 30 minutes is 28 pt tall, which is under the 44 pt a touch needs: its hit area grows, its look does not.
    func test_F013_design_aShortBlockHasAHitAreaOfAtLeast44Points() {
        let short = AgendaTimeline.BlockMetrics(minutes: 30, hourHeight: 56)
        XCTAssertEqual(short.height, 28, "the look keeps the minute scale, with its floor")
        XCTAssertGreaterThanOrEqual(short.touchHeight, 44)
        XCTAssertEqual(short.touchHeight - short.height, 2 * short.touchInset, "the room is shared above and below")

        let tiny = AgendaTimeline.BlockMetrics(minutes: 5, hourHeight: 56)
        XCTAssertEqual(tiny.height, 28)
        XCTAssertGreaterThanOrEqual(tiny.touchHeight, 44)

        let hour = AgendaTimeline.BlockMetrics(minutes: 60, hourHeight: 56)
        XCTAssertEqual(hour.height, 53, "an hour is the scale less the gap")
        XCTAssertEqual(hour.touchHeight, 53, "a block that is tall enough grows nothing")
        XCTAssertEqual(hour.touchInset, 0)
    }
}

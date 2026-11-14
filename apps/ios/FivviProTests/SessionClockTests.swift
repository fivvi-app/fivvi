import FivviAPI
import XCTest

@testable import FivviPro
@testable import FivviStrings

/// The date and start the session forms send, and how the screens write them (F020, ADR-012). The test plan runs every
/// test in nl and en (FivviPro.xctestplan).
final class SessionClockTests: XCTestCase {
    private let amsterdam = SessionFixtures.amsterdam

    func test_F020_AC1_theFormSendsTheDateAndTheStartInTheWorkspacesTimeZone() {
        // 23:40 UTC on 15 November is 00:40 on the 16th in Amsterdam (winter time, UTC+1).
        let start = Date(timeIntervalSince1970: 1_794_786_000)
        let local = SessionClock.localDate(start, in: amsterdam)
        let utc = SessionClock.localDate(start, in: TimeZone(identifier: "UTC") ?? .current)
        XCTAssertEqual(local, "2026-11-16", "the day in Amsterdam")
        XCTAssertEqual(utc, "2026-11-15", "the same instant is the day before in UTC")
        XCTAssertEqual(SessionClock.localStart(start, in: amsterdam), "00:40")
    }

    func test_F020_AC1_theFirstStartIsTheNextFullHour() {
        let first = SessionClock.nextFullHour(after: SessionFixtures.now, in: amsterdam)
        XCTAssertEqual(SessionClock.localDate(first, in: amsterdam), "2026-11-16")
        XCTAssertEqual(SessionClock.localStart(first, in: amsterdam), "09:00")
        let onTheHour = SessionClock.nextFullHour(after: SessionFixtures.at("2026-11-16", "09:00"), in: amsterdam)
        XCTAssertEqual(SessionClock.localStart(onTheHour, in: amsterdam), "10:00", "a start now is the hour after")
    }

    func test_F020_AC1_theEndIsOnTheNextDayWhenItPassesMidnight() {
        let late = SessionFixtures.at("2026-11-16", "23:30")
        let end = SessionClock.end(of: late, minutes: 60, in: amsterdam)
        XCTAssertEqual(end.time, "00:30")
        XCTAssertTrue(end.nextDay)
        let early = SessionClock.end(of: SessionFixtures.at("2026-11-16", "09:00"), minutes: 45, in: amsterdam)
        XCTAssertEqual(early.time, "09:45")
        XCTAssertFalse(early.nextDay)
    }

    func test_F020_AC1_theEndOfASessionOnTheDayTheClocksGoBackIsTheTrueLength() {
        // 25 October 2026: 02:00 to 03:00 happens twice; a session of 90 minutes from 01:30 ends at 02:00 (the first
        // 02:00 is at 00:00 UTC, the 90 minutes end at 01:00 UTC, which reads 02:00 again).
        let start = SessionFixtures.at("2026-10-25", "01:30")
        XCTAssertEqual(SessionClock.end(of: start, minutes: 90, in: amsterdam).time, "02:00")
    }

    func test_F020_AC10_datesAreWrittenInTheInterfaceLanguageInTheWorkspacesTimeZone() {
        let language = TestCatalog.configuredLocale
        let catalog = Catalog(locale: language)
        let format = SessionFormat(locale: catalog.formattingLocale, timeZone: amsterdam)
        let start = SessionFixtures.at("2026-11-19", "09:05")
        XCTAssertEqual(format.time(start), "09:05")
        XCTAssertEqual(format.day(start), language == .nlNL ? "donderdag 19 november" : "Thursday 19 November")
        XCTAssertEqual(
            format.longDay(start), language == .nlNL ? "donderdag 19 november 2026" : "Thursday, 19 November 2026"
        )
    }
}

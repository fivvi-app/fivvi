import XCTest

@testable import FivviPro

/// E020 AC8: the date above a large title, in the language of the app and the workspace's time zone.
final class DateEyebrowTests: XCTestCase {
    /// 7 November 2026, 23:30 UTC: still Saturday in London, already Sunday 8 November in Amsterdam.
    private let lateSaturday = Date(timeIntervalSince1970: 1_794_094_200)
    private let amsterdam = TimeZone(identifier: "Europe/Amsterdam")!
    private let london = TimeZone(identifier: "Europe/London")!

    /// The words of a date without commas: iOS 26 and 27 differ in CLDR, and may or may not write one after the weekday.
    private func plain(_ date: String) -> String { date.replacingOccurrences(of: ",", with: "") }

    func test_E020_AC8_dateEyebrowReadsInDutchAndEnglish() {
        let dutch = DateEyebrow.text(for: lateSaturday, locale: Locale(identifier: "nl_NL"), timeZone: london)
        XCTAssertEqual(plain(dutch), "zaterdag 7 november")
        let english = DateEyebrow.text(for: lateSaturday, locale: Locale(identifier: "en_GB"), timeZone: london)
        XCTAssertEqual(plain(english), "Saturday 7 November")
    }

    func test_E020_AC8_dateEyebrowUsesTheWorkspaceTimeZone() {
        let dutch = DateEyebrow.text(for: lateSaturday, locale: Locale(identifier: "nl_NL"), timeZone: amsterdam)
        XCTAssertEqual(plain(dutch), "zondag 8 november")
    }

    func test_E020_AC8_theTimeZoneDefaultsToAmsterdam() {
        XCTAssertEqual(DateEyebrow.defaultTimeZone.identifier, "Europe/Amsterdam")
    }
}

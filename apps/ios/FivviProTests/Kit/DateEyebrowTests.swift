import XCTest

@testable import FivviPro

/// E020 AC8: the date above a large title, in the language of the app and the workspace's time zone.
final class DateEyebrowTests: XCTestCase {
    /// 7 November 2026, 23:30 UTC: still Saturday in London, already Sunday 8 November in Amsterdam.
    private let lateSaturday = Date(timeIntervalSince1970: 1_794_094_200)
    private let amsterdam = TimeZone(identifier: "Europe/Amsterdam")!
    private let london = TimeZone(identifier: "Europe/London")!

    func test_E020_AC8_dateEyebrowReadsInDutchAndEnglish() {
        XCTAssertEqual(
            DateEyebrow.text(for: lateSaturday, locale: Locale(identifier: "nl_NL"), timeZone: london),
            "zaterdag 7 november"
        )
        XCTAssertEqual(
            DateEyebrow.text(for: lateSaturday, locale: Locale(identifier: "en_GB"), timeZone: london),
            "Saturday 7 November"
        )
    }

    func test_E020_AC8_dateEyebrowUsesTheWorkspaceTimeZone() {
        XCTAssertEqual(
            DateEyebrow.text(for: lateSaturday, locale: Locale(identifier: "nl_NL"), timeZone: amsterdam),
            "zondag 8 november"
        )
    }

    func test_E020_AC8_theTimeZoneDefaultsToAmsterdam() {
        XCTAssertEqual(DateEyebrow.defaultTimeZone.identifier, "Europe/Amsterdam")
    }
}

import FivviAPI
import XCTest

@testable import FivviPro
@testable import FivviStrings
@testable import FivviLanguage

/// TD-03 for a date in a weekly series (F022 AC6, iOS #455): *Onderdeel van: {class}, elke {weekday} {time}* from the
/// series the API sends, and "12 groepslessen toegevoegd" on the screen a new weekly class opens on. The test plan runs
/// every test in nl and en (FivviPro.xctestplan).
@MainActor
final class ClassSeriesTests: XCTestCase {
    private let language = InterfaceLanguage.resolve(.system())
    private var english: Bool { language == .en }

    private func screen(
        _ api: StubAPI, id: String, memberID: String = StubSessions.myMemberID, canManage: Bool = true,
        added: Int? = nil
    ) -> ClassDateViewModel {
        ClassDateViewModel(
            api: api, workspace: SessionFixtures.workspace(as: memberID), sessionID: id,
            catalog: Catalog(locale: language), canManage: canManage, added: added
        )
    }

    /// "Kracht" (English "Strength") on Thursday 19 November 2026 at 18:00, in a weekly series unless `weekly` is false.
    private func strength(_ api: StubAPI, weekly: Bool = true) -> Components.Schemas.Session {
        let groupClass = api.classes.seed(nameNl: "Kracht", nameEn: "Strength", capacity: 8)
        return api.sessions.addGroupDate(
            of: groupClass, start: SessionFixtures.at("2026-11-19", "18:00"), minutes: 60, capacity: 8, trainer: nil,
            series: weekly ? .init(
                id: "5e1c2d3e-0000-4000-8000-000000000001", weekday: .th, localStartTime: "18:00",
                occurrenceDate: "2026-11-19", changedFields: []
            ) : nil
        )
    }

    private func weekdayName(_ day: String) -> String {
        SessionFormat(locale: Catalog(locale: language).formattingLocale, timeZone: SessionFixtures.amsterdam)
            .weekday(SessionFixtures.at(day, "12:00"))
    }

    func test_F022_AC6_aDateInASeriesSaysOnderdeelVanTheClassEveryWeekdayAndTime() async {
        let api = SessionFixtures.api()
        let model = screen(api, id: strength(api).id)
        XCTAssertNil(model.seriesLineText, "nothing before the date is read")

        await model.load()

        XCTAssertEqual(
            model.seriesLineText,
            String(
                format: TestCatalog(language)["classes.date.seriesLine"], english ? "Strength" : "Kracht", "18:00",
                weekdayName("2026-11-19")
            ),
            "Onderdeel van: Kracht, elke donderdag 18:00"
        )
        XCTAssertTrue(["donderdag", "Thursday"].contains(weekdayName("2026-11-19")))
    }

    func test_F022_AC6_theSeriesLineKeepsTheWallClockTimeOfTheSeriesAfterTheClocksChange() async {
        let api = SessionFixtures.api()
        let groupClass = api.classes.seed(nameNl: "Kracht", capacity: 8)
        // 18:00 in Amsterdam after the clocks went back (17:00 UTC): the series still says 18:00.
        let date = api.sessions.addGroupDate(
            of: groupClass, start: SessionFixtures.at("2026-10-27", "18:00"), minutes: 60, capacity: 8, trainer: nil,
            series: .init(
                id: "5e1c2d3e-0000-4000-8000-000000000001", weekday: .tu, localStartTime: "18:00",
                occurrenceDate: "2026-10-27", changedFields: []
            )
        )
        let model = screen(api, id: date.id)
        await model.load()
        XCTAssertTrue(model.seriesLineText?.contains("18:00") == true, model.seriesLineText ?? "nil")
        XCTAssertTrue(model.seriesLineText?.contains(weekdayName("2026-10-27")) == true)
    }

    func test_F022_AC6_aDateOnItsOwnHasNoSeriesLine() async {
        let api = SessionFixtures.api()
        let model = screen(api, id: strength(api, weekly: false).id)
        await model.load()
        XCTAssertNil(model.seriesLineText)
    }

    func test_F022_AC6_aTrainerReadsTheSeriesLineToo() async {
        let api = SessionFixtures.api()
        let model = screen(api, id: strength(api).id, memberID: StubSessions.otherMemberID, canManage: false)
        await model.load()
        XCTAssertNotNil(model.seriesLineText)
    }

    func test_F022_AC6_aNewWeeklyClassOpensWithTwelveGroepslessenToegevoegd() async {
        let api = SessionFixtures.api()
        let id = strength(api).id
        let catalog = TestCatalog(language)

        let weekly = screen(api, id: id, added: 12)
        XCTAssertEqual(weekly.addedText, String(format: catalog["classes.schedule.savedSeries"], 12))
        XCTAssertTrue(weekly.addedText?.contains("12") == true, weekly.addedText ?? "nil")
        XCTAssertFalse(weekly.addedText?.contains("%") == true)

        let single = screen(api, id: id, added: 1)
        XCTAssertEqual(single.addedText, catalog["classes.schedule.saved"], "Groepsles toegevoegd")
        XCTAssertNil(screen(api, id: id).addedText, "opened from the calendar: no confirmation")
    }
}

import FivviAPI
import XCTest

@testable import FivviPro
@testable import FivviStrings
@testable import FivviLanguage

/// TD-05 *Herhalen* (F022 AC6, AC7, iOS #455): *Niet herhalen* or *Elke week op {weekday}*, the weekly request, the 12
/// dates the API makes with their series, and the DST refusal as the API words it. The test plan runs every test in nl
/// and en (FivviPro.xctestplan).
@MainActor
final class NewGroupClassRepeatTests: XCTestCase {
    private let language = InterfaceLanguage.resolve(.system())

    private func form(_ api: StubAPI) -> NewGroupClassViewModel {
        NewGroupClassViewModel(
            api: api, workspace: SessionFixtures.workspace(as: StubSessions.myMemberID),
            catalog: Catalog(locale: language), email: "owner@example.com", accountName: "Owner",
            now: SessionFixtures.now
        )
    }

    /// Thursday 19 November 2026, 18:00 in Amsterdam: the form's date and start for the weekly Mobility.
    private func weeklyMobility(_ api: StubAPI, start: Date = SessionFixtures.at("2026-11-19", "18:00"))
        async -> NewGroupClassViewModel {
        let model = form(api)
        await model.start()
        model.nameNl = "Mobility"
        model.time.start = start
        return model
    }

    private func weekdayName(_ day: String) -> String {
        SessionFormat(locale: Catalog(locale: language).formattingLocale, timeZone: SessionFixtures.amsterdam)
            .weekday(SessionFixtures.at(day, "12:00"))
    }

    func test_F022_AC6_herhalenOffersNietHerhalenAndElkeWeekOpTheWeekdayOfTheChosenDate() async {
        let api = SessionFixtures.api()
        let model = await weeklyMobility(api)
        let catalog = TestCatalog(language)

        XCTAssertFalse(model.repeatsWeekly, "Niet herhalen is the default")
        XCTAssertEqual(model.repeatLabel, catalog["classes.schedule.repeatLabel"])
        XCTAssertEqual(model.repeatNoneText, catalog["classes.schedule.repeatNone"])
        XCTAssertEqual(
            model.repeatWeeklyText,
            String(format: catalog["classes.schedule.repeatWeekly"], weekdayName("2026-11-19")),
            "Elke week op donderdag, the weekday of the date"
        )
        XCTAssertTrue(["donderdag", "Thursday"].contains(weekdayName("2026-11-19")))
        XCTAssertNil(model.repeatNoteText, "the note shows with the weekly choice")

        model.time.start = SessionFixtures.at("2026-11-23", "18:00")
        XCTAssertEqual(
            model.repeatWeeklyText, String(format: catalog["classes.schedule.repeatWeekly"], weekdayName("2026-11-23")),
            "the weekday follows the date"
        )
        XCTAssertNotEqual(weekdayName("2026-11-23"), weekdayName("2026-11-19"))
    }

    func test_F022_AC6_weeklyShowsTheNoteAndMakesTheFormDirty() async {
        let model = form(SessionFixtures.api())
        await model.start()
        XCTAssertFalse(model.isDirty)

        model.repeatsWeekly = true

        XCTAssertEqual(
            model.repeatNoteText, TestCatalog(language)["classes.schedule.repeatNote"], "12 weken in de agenda"
        )
        XCTAssertTrue(model.isDirty, "leaving with Herhalen chosen asks first")
    }

    func test_F022_AC6_aWeeklyMobilityOnThursdayIsSentAsWeeklyAndTheAPIMakesTwelveDatesWithTheSeries() async throws {
        let api = SessionFixtures.api()
        let model = await weeklyMobility(api)
        model.repeatsWeekly = true

        let date = await model.save()

        let sent = try XCTUnwrap(api.classes.creates.first)
        XCTAssertEqual(api.classes.creates.count, 1, "one request: the class and its series")
        XCTAssertEqual(sent.firstDate?._repeat, .weekly)
        XCTAssertEqual(sent.firstDate?.localDate, "2026-11-19")
        XCTAssertEqual(sent.firstDate?.localStart, "18:00")
        XCTAssertEqual(api.classes.all.map(\.nameNl), ["Mobility"])
        XCTAssertEqual(api.sessions.all.count, 12, "the API put 12 dates in the calendar")
        XCTAssertEqual(model.datesAdded, 12, "12 groepslessen toegevoegd")
        XCTAssertEqual(date?.series?.weekday, .th)
        XCTAssertEqual(date?.series?.localStartTime, "18:00")
    }

    func test_F022_AC6_withoutHerhalenTheDateIsSentOnItsOwnAndAddsOne() async throws {
        let api = SessionFixtures.api()
        let model = await weeklyMobility(api)

        let date = await model.save()

        XCTAssertNotEqual(api.classes.creates.first?.firstDate?._repeat, .weekly)
        XCTAssertEqual(api.sessions.all.count, 1)
        XCTAssertEqual(model.datesAdded, 1)
        XCTAssertNil(date?.series)
    }

    func test_F022_AC7_aWeeklyTimeTheClocksSkipOnOneOfItsDatesShowsTheAPIsMessageWithThatDateAndStoresNothing() async {
        let api = SessionFixtures.api()
        api.classes.skipsStart(on: "2027-03-28")
        let model = await weeklyMobility(api, start: SessionFixtures.at("2027-03-14", "02:30"))
        model.repeatsWeekly = true

        let date = await model.save()

        XCTAssertNil(date)
        XCTAssertTrue(api.classes.all.isEmpty, "nothing is created")
        XCTAssertTrue(api.sessions.all.isEmpty)
        XCTAssertEqual(model.time.refusal, .timeDoesNotExist)
        let format = SessionFormat(
            locale: Catalog(locale: language).formattingLocale, timeZone: SessionFixtures.amsterdam
        )
        XCTAssertEqual(
            model.timeRefusalText,
            String(
                format: TestCatalog(language)["classes.schedule.errors.timeDoesNotExist"],
                format.day(SessionFixtures.at("2027-03-28", "12:00"))
            ),
            "Deze tijd bestaat niet op {date} door de zomertijd. Kies een andere tijd., the date the API named"
        )
        XCTAssertNil(model.saveFailureText)
        XCTAssertTrue(model.repeatsWeekly, "what was chosen stays")
        XCTAssertEqual(model.nameNl, "Mobility")
    }

    func test_F022_AC7_aSkippedStartOnASingleDateNamesTheDateOfTheStart() async {
        let api = SessionFixtures.api()
        api.classes.fail(.create, with: .badRequest(path: "firstDate.localStart", code: "time_does_not_exist"))
        let model = await weeklyMobility(api, start: SessionFixtures.at("2027-03-28", "01:30"))

        _ = await model.save()

        let format = SessionFormat(
            locale: Catalog(locale: language).formattingLocale, timeZone: SessionFixtures.amsterdam
        )
        XCTAssertEqual(
            model.timeRefusalText,
            String(
                format: TestCatalog(language)["classes.schedule.errors.timeDoesNotExist"],
                format.day(model.time.start)
            )
        )
    }
}

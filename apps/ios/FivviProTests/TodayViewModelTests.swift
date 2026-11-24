import FivviAPI
import XCTest

@testable import FivviPro
@testable import FivviStrings
@testable import FivviLanguage

/// TD-01 *Vandaag* (F013 AC1, AC2, AC5, AC7, AC8, AC14 and the design of `DECISIONS.md` §3, iOS): the day across workspaces
/// as `GET /api/v1/me/day` answers it. The test plan runs every test in nl and en (FivviPro.xctestplan).
@MainActor
final class TodayViewModelTests: XCTestCase {
    private let language = InterfaceLanguage.resolve(.system())
    private var catalog: TestCatalog { TestCatalog(language) }
    private var format: SessionFormat {
        SessionFormat(locale: Catalog(locale: language).formattingLocale, timeZone: SessionFixtures.amsterdam)
    }

    private func model(
        _ api: StubAPI, store: PersonalStore = MemoryPersonalStore(), now: Date = PersonalFixtures.now,
        device: TimeZone = SessionFixtures.amsterdam
    ) -> TodayViewModel {
        TodayViewModel(
            api: api, catalog: Catalog(locale: language), store: store, now: { now }, deviceTimeZone: device
        )
    }

    private func served(_ day: PersonalDay) -> StubAPI {
        let api = StubAPI()
        api.myDay.serve(day)
        return api
    }

    func test_F013_AC1_todayShowsMyDayAcrossWorkspaces() async {
        let api = served(PersonalFixtures.sarah())
        let today = model(api)
        XCTAssertEqual(today.state, .loading)

        await today.load()

        XCTAssertEqual(today.state, .loaded)
        XCTAssertEqual(today.summaryText, String(format: catalog["myDay.app.summary"], 4, "0", "09:00", "19:00"))
        XCTAssertEqual(today.nextCaption(at: PersonalFixtures.now), String(format: catalog["myDay.nextUpcoming"], "25"))
        XCTAssertEqual(today.next?.row.title, "Anna de Vries")
        XCTAssertEqual(today.next?.row.workspaceLabel, "Sarah Personal Training")
        XCTAssertEqual(today.rows.map(\.title), ["Mark Jansen", "Kracht", "Kracht"], "the next item is not repeated")
        let mark = today.rows[0]
        XCTAssertEqual(mark.typeLabel, catalog["myDay.typePrivate"])
        XCTAssertEqual(mark.workspaceLabel, "John's Gym")
        XCTAssertEqual(mark.location, "John's Gym")
        XCTAssertEqual(today.next?.row.location, "TrainMore Zuid")
        XCTAssertEqual(
            today.nextSubtitle,
            "09:00–10:00 · \(catalog["myDay.typePrivate"]) · TrainMore Zuid · Sarah Personal Training"
        )
        XCTAssertEqual(today.rows[1].typeLabel, catalog["myDay.typeGroup"])
        let cancelled = today.rows[2]
        XCTAssertTrue(cancelled.isCancelled)
        XCTAssertTrue(cancelled.spokenLabel.contains(catalog["myDay.cancelled"]))
        XCTAssertEqual(api.myDay.queries.map(\.date), [PersonalFixtures.day], "one request, for today in Dutch time")
        XCTAssertEqual(api.myDay.queries.map(\.surface), [.ios])
    }

    func test_F013_AC1_inProgressReadsNuBezigAndTheCountdownFollowsTheClock() async {
        let today = model(served(PersonalFixtures.sarah()))
        await today.load()

        XCTAssertEqual(
            today.nextCaption(at: PersonalFixtures.at("08:50")), String(format: catalog["myDay.nextUpcoming"], "10")
        )
        XCTAssertEqual(today.nextCaption(at: PersonalFixtures.at("09:05")), catalog["myDay.nextInProgress"])
    }

    func test_F013_AC2_workspaceLabelOnlyWithSeveralWorkspaces() async {
        let tom = PersonalFixtures.sarah(
            items: [
                PersonalFixtures.session(
                    "gym", PersonalFixtures.johns, from: "09:00", to: "10:00", client: "Mark Jansen"
                )
            ],
            workspaceCount: 1
        )
        let one = model(served(tom))
        await one.load()
        let several = model(served(PersonalFixtures.sarah()))
        await several.load()

        XCTAssertNil(one.next?.row.workspaceLabel, "Tom's one workspace shows no name and no dot")
        XCTAssertEqual(one.next?.row.spokenLabel.contains("John's Gym"), false)
        XCTAssertTrue((several.rows + [several.next?.row].compactMap { $0 }).allSatisfy { $0.workspaceLabel != nil })
    }

    func test_F013_design_privateOnlyShowsNoKindLabelAndNoGroupFigure() async {
        let solo = PersonalFixtures.sarah(
            items: [PersonalFixtures.anna, PersonalFixtures.mark], workspaceCount: 1, showsKindLabel: false
        )
        let today = model(served(solo))
        await today.load()

        XCTAssertNil(today.next?.row.typeLabel)
        XCTAssertNil(today.rows[0].typeLabel)
        XCTAssertNil(today.rows[0].pill)
        let spoken = today.next?.row.spokenLabel.lowercased()
        let word = catalog["myDay.typePrivate"].lowercased()
        XCTAssertEqual(spoken?.contains(word), true, "the type is always in the name")
    }

    func test_F013_1534_aDayOfOnlyPrivateSessionsStillNamesTheKindWhenTheApiSaysSo() async {
        let privateDay = PersonalFixtures.sarah(items: [PersonalFixtures.anna, PersonalFixtures.mark])
        let today = model(served(privateDay))
        await today.load()

        XCTAssertEqual(today.next?.row.typeLabel, catalog["myDay.typePrivate"])
        XCTAssertEqual(today.rows[0].typeLabel, catalog["myDay.typePrivate"])
        XCTAssertEqual(
            today.nextSubtitle,
            "09:00–10:00 · \(catalog["myDay.typePrivate"]) · TrainMore Zuid · Sarah Personal Training"
        )
    }

    func test_F013_1534_theAppNeverWorksTheKindOutFromTheItems() async {
        // Private and class items on the day, and the API says no: no row names its kind.
        let today = model(served(PersonalFixtures.sarah(showsKindLabel: false)))
        await today.load()

        XCTAssertNil(today.next?.row.typeLabel)
        XCTAssertTrue(today.rows.allSatisfy { $0.typeLabel == nil })
        XCTAssertEqual(today.rows[1].isGroup, true)
        let spoken = today.next?.row.spokenLabel.lowercased()
        XCTAssertEqual(spoken?.contains(catalog["myDay.typePrivate"].lowercased()), true)
    }

    func test_F013_design_classesShowTheKindLabelAndThePill() async {
        let full = PersonalFixtures.session(
            "full", PersonalFixtures.johns, from: "17:00", to: "18:00", className: "Kracht", booked: 8, capacity: 8
        )
        let today = model(served(PersonalFixtures.sarah(items: [PersonalFixtures.anna, PersonalFixtures.kracht, full])))
        await today.load()

        XCTAssertEqual(today.rows[0].pill, String(format: catalog["myCalendar.blockBooked"], "0", "8"))
        XCTAssertEqual(today.rows[1].pill, catalog["myDay.app.full"])
        XCTAssertEqual(today.rows[0].typeLabel, catalog["myDay.typeGroup"])
    }

    func test_F013_design_theMijnDagCardShowsTheGapAndTheRouteWithTwoPlaces() async throws {
        let today = model(served(PersonalFixtures.sarah()))
        await today.load()

        let card = try XCTUnwrap(today.card)
        let gap = try XCTUnwrap(card.gap)
        XCTAssertEqual(gap.text, String(format: catalog["myDay.app.freeGap"], "12:00", "13:30"))
        XCTAssertEqual(
            gap.length,
            String(format: catalog["myDay.app.freeGapLength"], TodayViewModel.hours(1.5, locale: format.locale))
        )
        XCTAssertEqual(gap.start, PersonalFixtures.at("12:00"), "Plannen opens PS-04 at the start of the gap")
        XCTAssertEqual(card.route, "TrainMore Zuid → John's Gym")
        XCTAssertNil(card.noFreeTime)
    }

    func test_F013_design_oneOrNoPlaceAheadLeavesOutTheRouteAndNoGapSaysSo() async throws {
        let one = model(served(PersonalFixtures.sarah(gap: nil, places: ["John's Gym"])))
        await one.load()

        let card = try XCTUnwrap(one.card)
        XCTAssertNil(card.route)
        XCTAssertNil(card.gap)
        XCTAssertEqual(card.noFreeTime, catalog["myDay.app.noFreeTime"])
    }

    func test_F013_AC5_theEmptyTextsAndTheTomorrowLine() async {
        let none = model(served(PersonalFixtures.empty(nextSession: "2026-10-01", tomorrow: false)))
        await none.load()
        XCTAssertEqual(none.summaryText, catalog["myDay.app.summaryEmpty"])
        let date = format.day(localDate: "2026-10-01") ?? ""
        XCTAssertEqual(none.emptyText, String(format: catalog["myDay.emptyNext"], date))
        XCTAssertNil(none.tomorrowText)

        let never = model(served(PersonalFixtures.empty(hasSessions: false)))
        await never.load()
        XCTAssertEqual(never.emptyText, catalog["myDay.emptyNever"])

        let nothingToday = model(served(PersonalFixtures.empty(tomorrow: true)))
        await nothingToday.load()
        XCTAssertEqual(nothingToday.emptyText, catalog["myDay.emptyToday"])
        XCTAssertEqual(nothingToday.tomorrowText, String(format: catalog["myDay.tomorrow"], 3, "07:00"))
        XCTAssertEqual(nothingToday.tomorrowDate, "2026-09-23", "the line opens Agenda on that day")
    }

    func test_F013_AC7_offlineShowsCachedDay() async throws {
        let store = MemoryPersonalStore()
        let api = served(PersonalFixtures.sarah())
        await model(api, store: store).load()
        api.myDay.fail(.offline)
        let later = model(api, store: store, now: PersonalFixtures.at("08:50"))

        await later.load()

        XCTAssertEqual(later.state, .loaded)
        XCTAssertTrue(later.isOffline)
        XCTAssertEqual(later.offlineText, String(format: catalog["myDay.app.offline"], "08:35"))
        XCTAssertEqual(later.rows.count, 3, "the cached day stays on screen")
        XCTAssertNil(later.failedText)

        api.myDay.fail(nil)
        await later.load()
        XCTAssertFalse(later.isOffline, "back online, a refresh updates it")
        XCTAssertNil(later.offlineText)
    }

    func test_F013_AC7_aFailureThatIsNotTheConnectionKeepsTheDayWithRetry() async {
        let api = served(PersonalFixtures.sarah())
        let today = model(api)
        await today.load()
        api.myDay.fail(.status(500))

        await today.load()

        XCTAssertEqual(today.state, .loaded)
        XCTAssertFalse(today.isOffline)
        XCTAssertEqual(today.failedText, catalog["myDay.app.failed"])
        XCTAssertEqual(today.rows.count, 3)
    }

    func test_F013_AC7_withNothingKeptTheFirstFailureIsTheErrorState() async {
        let api = StubAPI()
        api.myDay.fail(.status(500))
        let today = model(api)

        await today.load()

        XCTAssertEqual(today.state, .failed)
        XCTAssertEqual(today.failedText, catalog["myDay.app.failed"])
    }

    func test_F013_AC7_aDayKeptForAnotherDateIsNotShown() async {
        let store = MemoryPersonalStore()
        let api = served(PersonalFixtures.sarah())
        await model(api, store: store).load()
        api.myDay.fail(.offline)

        let tomorrow = model(api, store: store, now: PersonalFixtures.at("08:35", "2026-09-23"))
        await tomorrow.load()

        XCTAssertEqual(tomorrow.state, .failed, "yesterday's day is not today's")
        XCTAssertNil(tomorrow.day)
    }

    func test_F013_AC8_removedWorkspaceNoticeOnce() async {
        let store = MemoryPersonalStore()
        let today = model(served(PersonalFixtures.sarah()), store: store)
        let sarah = PersonalCache.Workspace(id: PersonalFixtures.sarahPT.id, name: PersonalFixtures.sarahPT.name)
        let johns = PersonalCache.Workspace(id: PersonalFixtures.johns.id, name: PersonalFixtures.johns.name)
        today.workspacesListed([sarah, johns])
        XCTAssertTrue(today.notices.isEmpty, "the first list has nothing to lose")

        today.workspacesListed([sarah])
        XCTAssertEqual(today.notices, [String(format: catalog["myDay.app.removed"], "John's Gym")])

        today.dismissNotices()
        today.workspacesListed([sarah])
        XCTAssertTrue(today.notices.isEmpty, "it shows once")
        let another = model(served(PersonalFixtures.sarah()), store: store)
        another.workspacesListed([sarah])
        XCTAssertTrue(another.notices.isEmpty, "also after the app starts again")
    }

    func test_F013_AC14_timesInAmsterdamWithHint() async throws {
        let newYork = try XCTUnwrap(TimeZone(identifier: "America/New_York"))
        let abroad = model(served(PersonalFixtures.sarah()), device: newYork)
        await abroad.load()
        let home = model(served(PersonalFixtures.sarah()))
        await home.load()

        XCTAssertEqual(abroad.timeZoneHint, catalog["personal.timeZoneHint"])
        XCTAssertNil(home.timeZoneHint)
        XCTAssertEqual(abroad.rows[0].timeText, home.rows[0].timeText, "the times stay in Dutch time")
        XCTAssertEqual(abroad.rows[0].startText, "11:00")
        XCTAssertEqual(abroad.summaryText, home.summaryText)
    }

    func test_F013_AC4_anItemOpensInItsOwnWorkspace() async {
        let today = model(served(PersonalFixtures.sarah()))
        await today.load()

        XCTAssertEqual(
            PersonalRoute(today.rows[0]), .session(workspaceID: PersonalFixtures.johns.id, id: "mark"),
            "a private session opens TD-02 of John's Gym, not of the current workspace"
        )
        XCTAssertEqual(
            PersonalRoute(today.rows[1]), .classDate(workspaceID: PersonalFixtures.johns.id, id: "kracht"),
            "a class date opens TD-03"
        )
    }
}

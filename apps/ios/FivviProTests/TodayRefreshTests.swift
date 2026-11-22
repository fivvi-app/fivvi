import FivviAPI
import XCTest

@testable import FivviPro
@testable import FivviStrings
@testable import FivviLanguage

/// TD-01 *Vandaag* (F013 AC7, AC8): the day kept on the phone belongs to a date, and a pull reads the account again too.
/// The test plan runs every test in nl and en (FivviPro.xctestplan).
@MainActor
final class TodayRefreshTests: XCTestCase {
    private let language = InterfaceLanguage.resolve(.system())
    private var catalog: TestCatalog { TestCatalog(language) }

    private final class MutableClock: @unchecked Sendable {
        var now: Date
        init(_ now: Date) { self.now = now }
    }

    private func served(_ day: PersonalDay) -> StubAPI {
        let api = StubAPI()
        api.myDay.serve(day)
        return api
    }

    func test_F013_AC7_oneModelOfferedAnotherDateKeepsNothingOfTheEarlierOne() async {
        let store = MemoryPersonalStore()
        let clock = MutableClock(PersonalFixtures.now)
        let api = served(PersonalFixtures.sarah())
        let today = TodayViewModel(
            api: api, catalog: Catalog(locale: language), store: store, now: { clock.now },
            deviceTimeZone: SessionFixtures.amsterdam
        )
        await today.load()
        XCTAssertEqual(today.day?.date, PersonalFixtures.day)

        // The phone stays open across midnight, offline: the next day has nothing kept for it.
        clock.now = PersonalFixtures.at("00:05", "2026-09-23")
        api.myDay.fail(.offline)
        await today.load()

        XCTAssertEqual(today.state, .failed, "yesterday's day is not today's")
        XCTAssertNil(today.day)
        XCTAssertTrue(today.isOffline)
        XCTAssertNil(today.updatedAt)
    }

    func test_F013_AC7_theErrorStateShowsOneRetryEvenAfterAnEarlierFailure() async {
        let clock = MutableClock(PersonalFixtures.at("23:30"))
        let api = served(PersonalFixtures.sarah())
        let today = TodayViewModel(
            api: api, catalog: Catalog(locale: language), store: MemoryPersonalStore(), now: { clock.now },
            deviceTimeZone: SessionFixtures.amsterdam
        )
        await today.load()
        api.myDay.fail(.status(500))
        await today.load()
        XCTAssertTrue(today.updateFailed, "the day on screen stays, with the banner")

        // Offline after midnight with nothing kept for the new date: the error state has the one retry.
        clock.now = PersonalFixtures.at("00:05", "2026-09-23")
        api.myDay.fail(.offline)
        await today.load()

        XCTAssertEqual(today.state, .failed)
        XCTAssertFalse(today.updateFailed, "the banner's retry is not shown next to the error state's")
    }

    func test_F013_AC7_aDayKeptForTheNewDateIsShownInsteadOfTheEarlierOne() async {
        let store = MemoryPersonalStore()
        let clock = MutableClock(PersonalFixtures.now)
        let api = served(PersonalFixtures.sarah())
        let today = TodayViewModel(
            api: api, catalog: Catalog(locale: language), store: store, now: { clock.now },
            deviceTimeZone: SessionFixtures.amsterdam
        )
        await today.load()
        // Another start of the app read the next day meanwhile, and the phone kept it.
        var nextDay = PersonalFixtures.empty()
        nextDay.date = "2026-09-23"
        let reopened = StubAPI()
        reopened.myDay.serve(nextDay)
        await TodayViewModel(
            api: reopened, catalog: Catalog(locale: language), store: store,
            now: { PersonalFixtures.at("06:00", "2026-09-23") }, deviceTimeZone: SessionFixtures.amsterdam
        ).load()

        clock.now = PersonalFixtures.at("07:00", "2026-09-23")
        api.myDay.fail(.offline)
        await today.load()

        XCTAssertEqual(today.state, .loaded)
        XCTAssertEqual(today.day?.date, "2026-09-23", "the kept day of today, not the earlier one on screen")
        XCTAssertTrue(today.isOffline)
        XCTAssertTrue(today.rows.isEmpty)
    }

    func test_F013_AC8_aPullAsksTheAccountAgainAndShowsTheRemovedWorkspaceNotice() async {
        let store = MemoryPersonalStore()
        let sarah = PersonalCache.Workspace(id: PersonalFixtures.sarahPT.id, name: PersonalFixtures.sarahPT.name)
        let johns = PersonalCache.Workspace(id: PersonalFixtures.johns.id, name: PersonalFixtures.johns.name)
        var listed = [sarah, johns]
        let api = served(PersonalFixtures.sarah())
        let today = TodayViewModel(
            api: api, catalog: Catalog(locale: language), store: store, now: { PersonalFixtures.now },
            deviceTimeZone: SessionFixtures.amsterdam, refreshAccount: { listed }
        )
        await today.refresh()
        XCTAssertTrue(today.notices.isEmpty, "the first list has nothing to lose")

        listed = [sarah]
        await today.refresh()

        XCTAssertEqual(today.notices, [String(format: catalog["myDay.app.removed"], "John's Gym")])
        XCTAssertEqual(api.myDay.queries.count, 2, "the day is read on each pull too")

        await today.refresh()
        XCTAssertEqual(today.notices.count, 1, "it shows once")
    }

    func test_F013_AC8_aPullWhereTheAccountCantBeReadLeavesTheNoticesAlone() async {
        let today = TodayViewModel(
            api: served(PersonalFixtures.sarah()), catalog: Catalog(locale: language), store: MemoryPersonalStore(),
            now: { PersonalFixtures.now }, deviceTimeZone: SessionFixtures.amsterdam, refreshAccount: { nil }
        )

        await today.refresh()

        XCTAssertTrue(today.notices.isEmpty)
        XCTAssertEqual(today.state, .loaded)
    }
}

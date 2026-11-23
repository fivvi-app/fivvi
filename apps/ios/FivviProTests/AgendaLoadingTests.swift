import FivviAPI
import XCTest

@testable import FivviPro
@testable import FivviStrings
@testable import FivviLanguage

/// The states of *Agenda* (F013 AC4, AC7, AC14): kept answers offline, a read that fails, Dutch time on another clock, and
/// the route a session opens. The test plan runs every test in nl and en (FivviPro.xctestplan).
@MainActor
final class AgendaLoadingTests: AgendaTestCase {
    func test_F013_AC7_offlineShowsTheLastResponseOfTheRange() async {
        let store = MemoryPersonalStore()
        let api = served()
        await model(api, store: store).load()
        api.mySessions.fail(.offline)
        let later = model(api, store: store, now: PersonalFixtures.at("08:50"))

        await later.load()

        XCTAssertEqual(later.state, .loaded)
        XCTAssertTrue(later.isOffline)
        XCTAssertEqual(later.offlineText, String(format: catalog["myDay.app.offline"], "08:35"))
        XCTAssertEqual(later.rows(on: "2026-09-22").count, 4, "the kept week stays on screen")
        XCTAssertNil(later.failedText)

        api.mySessions.fail(nil)
        await later.load()
        XCTAssertFalse(later.isOffline)
        XCTAssertNil(later.offlineText)
    }

    func test_F013_AC7_aRangeNothingIsKeptForIsTheErrorState() async {
        let store = MemoryPersonalStore()
        let api = served()
        await model(api, store: store).load()
        api.mySessions.fail(.offline)
        let other = model(api, store: store)
        other.open(day: "2026-11-10")

        await other.load()

        XCTAssertEqual(other.state, .failed)
        XCTAssertTrue(other.isOffline)
    }

    func test_F013_AC7_aFailureThatIsNotTheConnectionKeepsTheWeekWithRetry() async {
        let api = served()
        let agenda = model(api)
        await agenda.load()
        api.mySessions.fail(.status(500))

        await agenda.load()

        XCTAssertEqual(agenda.state, .loaded)
        XCTAssertFalse(agenda.isOffline)
        XCTAssertEqual(agenda.failedText, catalog["myCalendar.app.failed"])
        XCTAssertEqual(agenda.rows(on: "2026-09-22").count, 4)
    }

    func test_F013_AC7_withNothingKeptTheFirstFailureIsTheErrorState() async {
        let api = StubAPI()
        api.mySessions.fail(.status(500))
        let agenda = model(api)

        await agenda.load()

        XCTAssertEqual(agenda.state, .failed)
        XCTAssertEqual(agenda.failedText, catalog["myCalendar.app.failed"])
    }

    func test_F013_AC14_timesInAmsterdamWithHint() async throws {
        let newYork = try XCTUnwrap(TimeZone(identifier: "America/New_York"))
        let abroad = model(served(), device: newYork)
        await abroad.load()
        let home = model(served())
        await home.load()

        XCTAssertEqual(abroad.timeZoneHint, catalog["personal.timeZoneHint"])
        XCTAssertNil(home.timeZoneHint)
        XCTAssertEqual(abroad.rows(on: "2026-09-22").map(\.timeText), home.rows(on: "2026-09-22").map(\.timeText))
    }

    func test_F013_AC4_anItemOpensInItsOwnWorkspace() async {
        let agenda = model(served())
        await agenda.load()

        let rows = agenda.rows(on: "2026-09-22")
        XCTAssertEqual(
            PersonalRoute(rows[0]), .session(workspaceID: PersonalFixtures.sarahPT.id, id: "anna"),
            "a private session opens TD-02 of its own workspace, not of the current one"
        )
        XCTAssertEqual(
            PersonalRoute(rows[2]), .classDate(workspaceID: PersonalFixtures.johns.id, id: "kracht")
        )
    }
}

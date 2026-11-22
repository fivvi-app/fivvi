import FivviAPI
import XCTest

@testable import FivviPro
@testable import FivviStrings
@testable import FivviLanguage

/// The Owner's *Hele studio* day as it is read and as it is worded (F014 AC11): which day, in which time zone, and what
/// follows when the read fails.
@MainActor
final class StudioDayLoadingTests: StudioDayTestCase {
    // MARK: The day and the zone

    private final class Clock: @unchecked Sendable {
        var now: Date
        init(_ now: Date) { self.now = now }
    }

    func test_F014_AC11_heleStudioReadsTheDayAgainWhenTheDateChangedWhileMijnDagWasOnScreen() async {
        let tomorrow = "2026-09-23"
        let api = johnWithATeam()
        let clock = Clock(PersonalFixtures.now)
        let model = StudioDayModel(api: api, catalog: Catalog(locale: language), now: { clock.now })
        await model.configure(workspace: johns, canManage: true)
        await model.select(.studio)
        XCTAssertEqual(model.day?.date, StudioFixtures.day)
        await model.select(.mine)

        clock.now = PersonalFixtures.at("09:00", tomorrow)
        api.workspaceDay.serve(.init(
            date: tomorrow, timeZone: "Europe/Amsterdam", items: [], attention: [], hasSessions: true
        ))
        await model.select(.studio)

        XCTAssertEqual(
            api.workspaceDay.requests.map(\.date), [StudioFixtures.day, tomorrow], "yesterday is not shown as today"
        )
        XCTAssertEqual(model.day?.date, tomorrow)
        XCTAssertEqual(model.state, .loaded)
    }

    func test_F014_AC11_aDayThatIsStillTodayIsNotReadAgainWhenTheStudioIsChosenAgain() async {
        let api = johnWithATeam()
        let model = await studio(api)

        await model.select(.mine)
        await model.select(.studio)

        XCTAssertEqual(api.workspaceDay.requests.count, 1)
    }

    func test_F014_AC11_theStudioDayIsRenderedInTheWorkspaceTimeZone() async throws {
        let newYork = TimeZone(identifier: "America/New_York") ?? .gmt
        let workspace = CurrentWorkspace(
            id: johns.id, name: johns.name, defaultLocale: .nlNL, timeZone: newYork, teamMemberId: StudioFixtures.johnID
        )
        let day = Components.Schemas.WorkspaceDay(
            date: StudioFixtures.day, timeZone: "America/New_York",
            items: [StudioFixtures.mark, StudioFixtures.kracht, StudioFixtures.anna], attention: [], hasSessions: true
        )
        let api = johnWithATeam(day: day)
        let model = makeModel(api)
        await model.configure(workspace: workspace, canManage: true)
        await model.select(.studio)

        let timeline = try XCTUnwrap(model.team(at: PersonalFixtures.now).flatMap(\.timeline))
        let mark = try XCTUnwrap(timeline.lanes.flatMap(\.blocks).first { $0.row.id == "mark" })

        // 07:00 in Amsterdam (UTC+2 in September) is 01:00 in New York (UTC-4).
        XCTAssertEqual(mark.row.startText, "01:00")
        XCTAssertEqual(mark.row.endText, "02:00")
        let rows = model.rows(at: PersonalFixtures.now)
        XCTAssertEqual(rows.first { $0.id == "mark" }?.startText, "01:00", "the rows too")
        XCTAssertEqual(model.next(at: PersonalFixtures.now)?.row.startText, "04:00", "the next card: 10:00 Amsterdam")
        XCTAssertEqual(timeline.ticks.first?.label, "01", "the axis starts at the first hour of the workspace's day")
    }

    // MARK: Failing

    func test_F014_AC11_aDayThatCannotBeReadShowsOpnieuwAndKeepsWhatItHad() async {
        let api = johnWithATeam()
        let model = await studio(api)
        XCTAssertEqual(model.state, .loaded)

        api.workspaceDay.fail(.offline)
        await model.load()
        XCTAssertEqual(model.state, .loaded, "the day on screen stays")
        XCTAssertTrue(model.isOffline)

        api.workspaceDay.fail(.status(500))
        await model.load()
        XCTAssertTrue(model.updateFailed)
        XCTAssertFalse(model.isOffline)

        api.workspaceDay.fail(nil)
        await model.load()
        XCTAssertFalse(model.updateFailed)
        XCTAssertFalse(model.isOffline)
    }

    func test_F014_AC11_withNoDayToShowTheStudioFailsWithItsOwnRetry() async {
        let api = johnWithATeam()
        api.workspaceDay.fail(.status(500))

        let model = await studio(api)

        XCTAssertEqual(model.state, .failed)
        XCTAssertEqual(model.failedText, catalog["myDay.app.failed"])
        api.workspaceDay.fail(nil)
        await model.refresh()
        XCTAssertEqual(model.state, .loaded)
        XCTAssertNil(model.failedText)
    }

    func test_F014_AC11_aWorkspaceThatRefusesTheDayHidesTheControl() async {
        let api = johnWithATeam()
        api.workspaceDay.fail(.forbidden)
        var told = 0

        let model = makeModel(api, onForbidden: { told += 1 })
        await model.configure(workspace: johns, canManage: true)
        await model.select(.studio)

        XCTAssertFalse(model.showsToggle, "the API's 403 is the last word on calendar.manage")
        XCTAssertEqual(model.scope, .mine)
        XCTAssertEqual(told, 1, "the capability helper is told, so it reads the account again")
    }
}

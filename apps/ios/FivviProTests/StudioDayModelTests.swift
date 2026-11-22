import FivviAPI
import XCTest

@testable import FivviPro
@testable import FivviStrings
@testable import FivviLanguage

/// The Owner's *Mijn dag | Hele studio* on Vandaag (F014 AC11, the design of `DECISIONS.md` §3, iOS): the control for an
/// Owner of a workspace with a team, and the workspace's day as `GET /api/v1/workspaces/{id}/day` answers it:
/// a team card with a lane per trainer and the busiest moment, the next card and the rows, each with its trainer. The test
/// plan runs every test in nl and en (FivviPro.xctestplan).
@MainActor
final class StudioDayModelTests: StudioDayTestCase {
    // MARK: The control

    func test_F014_AC11_theControlShowsForAnOwnerWhoTrainsAndHasATeam() async {
        let api = johnWithATeam()
        let model = makeModel(api)
        XCTAssertFalse(model.showsToggle, "nothing shows before the workspace is known")

        await model.configure(workspace: johns, canManage: true)

        XCTAssertTrue(model.showsToggle, "John, Owner of John's Gym with Sarah and Tom")
        XCTAssertEqual(model.scope, .mine, "the default is Mijn dag")
        XCTAssertEqual(model.scopeMineText, catalog["myDay.app.scopeMine"])
        XCTAssertEqual(model.scopeStudioText, catalog["myDay.app.scopeStudio"])
        XCTAssertTrue(api.workspaceDay.requests.isEmpty, "the day is read once the studio is chosen")
    }

    func test_F014_AC11_aTrainerHasNoControl() async {
        let api = johnWithATeam()
        let model = makeModel(api)

        await model.configure(workspace: johns, canManage: false)

        XCTAssertFalse(model.showsToggle, "Sarah, a Trainer of John's Gym, has no calendar.manage")
        await model.select(.studio)
        XCTAssertFalse(model.isStudio)
        XCTAssertTrue(api.workspaceDay.requests.isEmpty)
    }

    func test_F014_AC11_anOwnerWithoutATeamHasNoControlAndNoStudioView() async {
        let solo = stubbed(trainers: [StudioFixtures.john])
        let alone = makeModel(solo)

        await alone.configure(workspace: johns, canManage: true)
        await alone.select(.studio)

        XCTAssertFalse(alone.showsToggle, "a solo PT")
        XCTAssertFalse(alone.isStudio, "no studio view without a team")
        XCTAssertTrue(solo.workspaceDay.requests.isEmpty)
    }

    func test_F014_AC11_anOwnerWhoDoesNotTrainStillHasTheControlForTheTeam() async {
        let day = StudioFixtures.johnsDay(items: [StudioFixtures.mark, StudioFixtures.lisa], busiest: nil)
        let api = stubbed(trainers: [StudioFixtures.sarah, StudioFixtures.tom], day: day)
        let model = makeModel(api)

        await model.configure(workspace: johns, canManage: true)

        XCTAssertTrue(model.showsToggle, "the ticket: calendar.manage and a team, more than one trainer")
        await model.select(.studio)
        XCTAssertTrue(model.isStudio)
        let lanes = model.team(at: PersonalFixtures.now)?.timeline?.lanes
        XCTAssertEqual(lanes?.map(\.isOwn), [false, false], "no lane of the Owner's own: no Jij")
    }

    func test_F014_AC11_aWorkspaceWithOneTrainerHasNoControlWhoeverThatIs() async {
        let api = stubbed(trainers: [StudioFixtures.sarah])
        let model = makeModel(api)

        await model.configure(workspace: johns, canManage: true)

        XCTAssertFalse(model.showsToggle, "one trainer is no team")
    }

    func test_F014_AC11_theControlIsGoneWhenTheWorkspaceChangesToOneWithoutATeam() async {
        let api = johnWithATeam()
        let model = await studio(api)
        XCTAssertTrue(model.isStudio)

        api.sessions.setTrainers([StudioFixtures.john], members: [])
        await model.configure(workspace: .init(
            id: "7c1d2e3f-0000-4000-8000-0000000000d2", name: "Sarah Personal Training", defaultLocale: .nlNL,
            timeZone: SessionFixtures.amsterdam, teamMemberId: StudioFixtures.johnID
        ), canManage: true)

        XCTAssertFalse(model.showsToggle)
        XCTAssertEqual(model.scope, .mine, "back on Mijn dag")
        XCTAssertNil(model.team(at: PersonalFixtures.now), "nothing of the other workspace's day stays")
    }

    func test_F014_AC11_aTeamThatCannotBeReadHidesTheControlUntilItCan() async {
        let api = johnWithATeam()
        api.sessions.fail(.trainers, with: .offline)
        let model = makeModel(api)

        await model.configure(workspace: johns, canManage: true)
        XCTAssertFalse(model.showsToggle, "unknown is not shown")

        api.sessions.fail(.trainers, with: nil)
        await model.refresh()
        XCTAssertTrue(model.showsToggle)
    }

    // MARK: Hele studio

    func test_F014_AC11_heleStudioReadsTheWorkspaceDayAndWordsTheLine() async {
        let api = johnWithATeam()
        let model = await studio(api)

        XCTAssertEqual(model.state, .loaded)
        XCTAssertEqual(
            api.workspaceDay.requests, [.init(workspaceID: johns.id, date: StudioFixtures.day)],
            "one request, for the app's current workspace and today in its time zone"
        )
        XCTAssertEqual(
            model.line, String(format: catalog["myDay.app.studioLine"], words, "John's Gym")
        )
    }

    func test_F014_AC11_theTeamCardNamesTheBusiestMomentAndHasALanePerTrainer() async throws {
        let model = await studio(johnWithATeam())

        let card = try XCTUnwrap(model.team(at: PersonalFixtures.now))

        XCTAssertEqual(card.head, String(format: catalog["myDay.app.studioTrainersMany"], "3", words))
        XCTAssertEqual(card.busiest, String(format: catalog["myDay.app.studioBusiest"], "2", "18:00", "19:00"))
        let lanes = try XCTUnwrap(card.timeline).lanes
        XCTAssertEqual(
            lanes.map(\.title), [catalog["myDay.app.studioYou"], firstName("Sarah de Boer"), firstName("Tom Bakker")],
            "the Owner first as Jij, then the others by name"
        )
        XCTAssertEqual(lanes.map(\.isOwn), [true, false, false])
        XCTAssertEqual(lanes.map { $0.blocks.map(\.row.id) }, [["anna"], ["mark", "kracht", "boxing"], ["lisa"]])
        XCTAssertEqual(lanes[1].avatarName, "Sarah de Boer", "the avatar of the person, not of the label")
    }

    func test_F014_AC11_aDayWithoutOverlapSaysSo() async throws {
        let apart = StudioFixtures.johnsDay(items: [StudioFixtures.mark, StudioFixtures.lisa], busiest: nil)
        let model = await studio(johnWithATeam(day: apart))

        let card = try XCTUnwrap(model.team(at: PersonalFixtures.now))

        XCTAssertEqual(card.busiest, catalog["myDay.app.studioNoOverlap"])
    }

    func test_F014_AC11_theBlocksSitAlongAnAxisOfThreeHoursAndPastOnesAreDimmed() async throws {
        let model = await studio(johnWithATeam())

        let timeline = try XCTUnwrap(model.team(at: PersonalFixtures.now).flatMap(\.timeline))

        XCTAssertEqual(timeline.ticks.map(\.label), ["07", "10", "13", "16", "19"], "from the first hour, every 3 h")
        XCTAssertEqual(timeline.ticks.map(\.fraction), [0, 0.25, 0.5, 0.75, 1])
        let mark = try XCTUnwrap(timeline.lanes[1].blocks.first)
        XCTAssertEqual(mark.left, 0, accuracy: 0.0001)
        XCTAssertEqual(mark.width, 1.0 / 12, accuracy: 0.0001, "one hour of twelve")
        XCTAssertTrue(mark.isPast, "ended at 08:00; it is 08:35")
        XCTAssertFalse(timeline.lanes[1].blocks[1].isPast)
        let now = try XCTUnwrap(timeline.nowFraction)
        XCTAssertEqual(now, (35.0 / 60 + 1) / 12, accuracy: 0.0001, "the now-line at 08:35")
        let before = try XCTUnwrap(model.team(at: PersonalFixtures.at("06:00")).flatMap(\.timeline))
        XCTAssertNil(before.nowFraction, "no now-line outside the axis")
    }

    func test_F014_AC11_sessionsOfOneTrainerAtTheSameTimeAreStackedInTheLane() async throws {
        let double = StudioFixtures.session(
            "double", from: "07:30", to: "08:30", trainer: StudioFixtures.sarah, client: "Lisa Smit"
        )
        let day = StudioFixtures.johnsDay(items: [StudioFixtures.mark, double], busiest: nil)
        let model = await studio(johnWithATeam(day: day))

        let lane = try XCTUnwrap(model.team(at: PersonalFixtures.now).flatMap(\.timeline)).lanes[0]

        XCTAssertEqual(lane.blocks.map(\.stack), [0, 1])
        XCTAssertEqual(lane.rowCount, 2)
    }

    func test_F014_AC11_aBlockIsNamedAfterItsTrainerItsTitleAndItsStart() async throws {
        let model = await studio(johnWithATeam())

        let timeline = try XCTUnwrap(model.team(at: PersonalFixtures.now).flatMap(\.timeline))

        let kracht = timeline.lanes[1].blocks[1]
        XCTAssertEqual(
            kracht.label, String(format: catalog["myDay.app.studioBlock"], "10:00", "Kracht", "Sarah de Boer")
        )
        XCTAssertEqual(kracht.row.id, "kracht", "it opens TD-03")
        XCTAssertTrue(kracht.row.isGroup)
        XCTAssertEqual(PersonalRoute(kracht.row), .classDate(workspaceID: johns.id, id: "kracht"))
        let mark = timeline.lanes[1].blocks[0]
        XCTAssertEqual(PersonalRoute(mark.row), .session(workspaceID: johns.id, id: "mark"), "it opens TD-02")
    }

    func test_F014_AC11_aCancelledSessionIsNoBlockAndSessionsWithoutATrainerGetTheLastLane() async throws {
        let nobody = StudioFixtures.session("yoga", from: "09:00", to: "10:00", className: "Yoga")
        let day = StudioFixtures.johnsDay(items: [
            StudioFixtures.mark, nobody, StudioFixtures.krachtCancelled
        ], busiest: nil)
        let model = await studio(johnWithATeam(day: day))

        let card = try XCTUnwrap(model.team(at: PersonalFixtures.now))
        let lanes = try XCTUnwrap(card.timeline).lanes

        XCTAssertEqual(lanes.map { $0.blocks.map(\.row.id) }, [["mark"], ["yoga"]], "Tom's only session is cancelled")
        XCTAssertEqual(lanes[1].title, String(format: catalog["myDay.app.studioNoTrainer"], word))
        XCTAssertNil(lanes[1].avatarName)
        XCTAssertEqual(
            card.head, String(format: catalog["myDay.app.studioTrainersOne"], "1", word),
            "the lane of nobody is no trainer"
        )
    }

    func test_F014_AC11_aDayWithoutSessionsSaysSoInTheTeamCard() async throws {
        let model = await studio(johnWithATeam(day: StudioFixtures.emptyDay))

        let card = try XCTUnwrap(model.team(at: PersonalFixtures.now))

        XCTAssertEqual(card.head, catalog["myDay.app.summaryEmpty"])
        XCTAssertNil(card.busiest)
        XCTAssertNil(card.timeline)
        XCTAssertTrue(model.rows(at: PersonalFixtures.now).isEmpty)
        XCTAssertNil(model.next(at: PersonalFixtures.now))
    }

    func test_F014_AC11_theRowsShowTheirTrainerAndTheNextCardNamesIt() async throws {
        let model = await studio(johnWithATeam())
        let now = PersonalFixtures.now

        let next = try XCTUnwrap(model.next(at: now))
        let rows = model.rows(at: now)

        XCTAssertEqual(next.row.id, "kracht", "the first session that has not ended, at 08:35")
        let expected = "10:00–11:00 · \(catalog["myDay.typeGroup"])\n\(trainerLine("Sarah de Boer"))"
        XCTAssertEqual(model.nextSubtitle(at: now), expected)
        XCTAssertEqual(model.nextCaption(at: now), String(format: catalog["myDay.nextUpcoming"], "85"))
        XCTAssertEqual(rows.map(\.id), ["mark", "lisa", "anna", "boxing", "kracht-late"], "the next is not repeated")
        XCTAssertEqual(
            rows.map(\.trainerText),
            ["Sarah de Boer", "Tom Bakker", catalog["myDay.app.studioYou"], "Sarah de Boer", "Tom Bakker"]
        )
        XCTAssertTrue(rows[0].isPast)
        XCTAssertTrue(rows[4].isCancelled)
        XCTAssertTrue(rows[2].spokenLabel.contains(catalog["myDay.app.studioYou"]), rows[2].spokenLabel)
        XCTAssertNil(rows[0].workspaceLabel, "one workspace: no name and no dot")
    }

    func test_F014_AC11_theNextCardCallsTheOwnersOwnSessionJij() async throws {
        let model = await studio(johnWithATeam(), now: PersonalFixtures.at("12:30"))

        let subtitle = try XCTUnwrap(model.nextSubtitle(at: PersonalFixtures.at("12:30")))

        XCTAssertTrue(subtitle.hasSuffix(trainerLine(catalog["myDay.app.studioYouLower"])), subtitle)
    }
}

import FivviAPI
import XCTest

@testable import FivviPro
@testable import FivviStrings
@testable import FivviLanguage

/// The nudge on Vandaag and on the Owner's *Hele studio* (F025 AC2, AC7 and the design of TD-01): an ended private session
/// whose client is still *Geboekt* shows *Aanwezigheid nog invullen*, and the *Mijn dag* card's first row, *Te doen*, has a
/// chip for it. The API says which sessions wait (`attendanceOpen`); the app leaves out what it already answered.
@MainActor
final class AttendanceNudgeTests: XCTestCase {
    private let language = InterfaceLanguage.resolve(.system())
    private var catalog: TestCatalog { TestCatalog(language) }
    private let anna = Components.Schemas.PersonalSessionClient(
        clientId: AttendanceFixtures.id("Anna de Vries"), name: "Anna de Vries"
    )

    /// Anna's 09:00 session as `GET /api/v1/me/day` answers it at 10:05, and Mark's at 11:00.
    private func day(annaOpen: Bool?, duo: Bool = false) -> PersonalDay {
        var anna = PersonalFixtures.anna
        anna.clients = duo
            ? [self.anna, .init(clientId: AttendanceFixtures.id("Bram Jansen"), name: "Bram Jansen")] : [self.anna]
        anna.attendanceOpen = annaOpen
        var day = PersonalFixtures.sarah(items: [anna, PersonalFixtures.mark], workspaceCount: 1, showsKindLabel: false)
        day.next = .init(sessionId: PersonalFixtures.mark.sessionId, state: .upcoming, startsInMinutes: 55)
        return day
    }

    private final class Online: @unchecked Sendable {
        var value = true
    }

    private struct Setup {
        let api: StubAPI
        let queue: AttendanceQueue
        let today: TodayViewModel
    }

    private func setup(
        _ day: PersonalDay, now: Date = PersonalFixtures.at("10:05"), online: Online = Online()
    ) async -> Setup {
        let api = StubAPI()
        api.myDay.serve(day)
        api.attendance.serve(
            [.init(id: self.anna.clientId, name: "Anna de Vries", status: .booked)], type: ._private,
            opensAt: PersonalFixtures.at("08:30")
        )
        let queue = AttendanceQueue(
            api: api, store: MemoryPersonalStore(), isOnline: { online.value }, retryAfter: nil
        )
        let today = TodayViewModel(
            api: api, catalog: Catalog(locale: language), store: MemoryPersonalStore(), now: { now }, attendance: queue
        )
        await today.load()
        return Setup(api: api, queue: queue, today: today)
    }

    private func annaRow(_ today: TodayViewModel) -> PersonalRow? { today.rows.first { $0.id == "anna" } }

    func test_F025_AC2_aPrivateSessionThatEndedWithItsClientBookedShowsTheNudgeWithTheTwoButtons() async {
        let run = await setup(day(annaOpen: true))
        let row = annaRow(run.today)
        XCTAssertEqual(row?.nudge, PersonalRow.Nudge(clientID: anna.clientId, clientName: "Anna de Vries"))
        XCTAssertTrue(
            row?.spokenLabel.hasSuffix(String(format: catalog["attendance.nudgeFor"], "Anna de Vries")) == true,
            "VoiceOver reads the nudge with the row"
        )
        XCTAssertNil(run.today.rows.first { $0.id == "mark" }?.nudge, "a session still to come has none")
    }

    func test_F025_AC2_duringTheSessionThereIsNoNudge() async {
        let run = await setup(day(annaOpen: nil), now: PersonalFixtures.at("09:50"))
        XCTAssertNil(annaRow(run.today)?.nudge)
        XCTAssertEqual(run.today.card?.todo.chips, [])
    }

    func test_F025_AC2_noShowSetsNoShowAndTheNudgeGoes() async throws {
        let run = await setup(day(annaOpen: true))
        let row = try XCTUnwrap(annaRow(run.today))
        run.today.mark(.noShow, row: row)
        XCTAssertNil(annaRow(run.today)?.nudge, "the nudge goes at once, before the request is sent")
        XCTAssertEqual(run.today.card?.todo.chips, [])
        await run.queue.flush()
        XCTAssertEqual(run.api.attendance.requests.map(\.status), ["no_show"])
        XCTAssertEqual(run.api.attendance.requests.map(\.clientID), [anna.clientId])
        XCTAssertNil(annaRow(run.today)?.nudge, "and stays gone while the day is read again")
        await run.today.load()
        XCTAssertNil(run.queue.settled["anna"], "the day has the answer now")
    }

    func test_F025_AC2_aTapTheApiRefusesBringsTheNudgeBackWhenTheDayIsReadAgain() async throws {
        let run = await setup(day(annaOpen: true))
        run.api.attendance.fail(.sessionCancelled)
        run.today.mark(.attended, row: try XCTUnwrap(annaRow(run.today)))
        await run.queue.flush()
        XCTAssertNotNil(annaRow(run.today)?.nudge, "a refused tap leaves the queue: Anna is still open")
    }

    func test_F025_AC8_aTapFromTheNudgeWhileOfflineKeepsTheRowWaitingForTheConnection() async throws {
        let online = Online()
        online.value = false
        let run = await setup(day(annaOpen: true), online: online)
        run.today.mark(.attended, row: try XCTUnwrap(annaRow(run.today)))
        await run.queue.flush()

        let waiting = try XCTUnwrap(annaRow(run.today)?.nudge)
        XCTAssertTrue(waiting.isWaiting, "the row stays, waiting, instead of the nudge going")
        XCTAssertEqual(waiting.waitingText, catalog["attendance.app.waiting"])
        XCTAssertNil(waiting.message)
        XCTAssertTrue(
            annaRow(run.today)?.spokenLabel.hasSuffix(catalog["attendance.app.waiting"]) == true,
            "VoiceOver says it waits"
        )
        XCTAssertTrue(run.api.attendance.requests.isEmpty)

        online.value = true
        await run.queue.flush()
        XCTAssertNil(annaRow(run.today)?.nudge, "sent: the row has nothing left to show")
        XCTAssertEqual(run.api.attendance.requests.map(\.status), ["attended"])
    }

    func test_F025_AC9_aTapTheSyncRefusesRevertsTheNudgeWithTheServersMessage() async throws {
        let online = Online()
        online.value = false
        let run = await setup(day(annaOpen: true), online: online)
        run.today.mark(.noShow, row: try XCTUnwrap(annaRow(run.today)))
        XCTAssertEqual(annaRow(run.today)?.nudge?.isWaiting, true)

        online.value = true
        run.api.attendance.fail(.sessionCancelled)
        await run.queue.flush()
        let reverted = try XCTUnwrap(annaRow(run.today)?.nudge)
        XCTAssertFalse(reverted.isWaiting, "the buttons are back")
        XCTAssertEqual(reverted.message, catalog["attendance.cancelledSession"])

        // A new tap takes the message away.
        run.api.attendance.fail(nil)
        run.today.mark(.attended, row: try XCTUnwrap(annaRow(run.today)))
        XCTAssertNil(annaRow(run.today)?.nudge?.message)
    }

    func test_F025_AC9_aTapRefusedAsTooEarlyNamesTheTimeTheWindowOpens() async throws {
        let run = await setup(day(annaOpen: true))
        run.api.attendance.fail(.tooEarly(PersonalFixtures.at("08:30")))
        run.today.mark(.attended, row: try XCTUnwrap(annaRow(run.today)))
        await run.queue.flush()
        XCTAssertEqual(
            annaRow(run.today)?.nudge?.message, String(format: catalog["attendance.tooEarly"], "08:30")
        )
    }

    func test_F025_AC9_aTapTheContractDoesNotListRevertsTheNudgeWithTheGenericMessage() async throws {
        let run = await setup(day(annaOpen: true))
        run.api.attendance.fail(.undocumented(418))
        run.today.mark(.attended, row: try XCTUnwrap(annaRow(run.today)))
        await run.queue.flush()
        XCTAssertEqual(annaRow(run.today)?.nudge?.message, catalog["attendance.errors.generic"])
    }

    func test_F025_aDuoHasNoInlineButtonsButItsChip() async {
        let run = await setup(day(annaOpen: true, duo: true))
        XCTAssertNil(annaRow(run.today)?.nudge)
        XCTAssertEqual(run.today.card?.todo.chips.map(\.id), ["anna"])
    }

    func test_F025_Design_theMijnDagCardsTeDoenChipOpensTheSessionAndOnceMarkedItSaysAllCaughtUp() async throws {
        let run = await setup(day(annaOpen: true))
        let todo = try XCTUnwrap(run.today.card?.todo)
        XCTAssertEqual(todo.title, catalog["attendance.app.todo"])
        XCTAssertEqual(todo.chips.map(\.text), [String(format: catalog["attendance.app.chip"], "Anna", "09:00")])
        XCTAssertEqual(PersonalRoute(todo.chips[0].row), .session(workspaceID: PersonalFixtures.sarahPT.id, id: "anna"))

        run.today.mark(.attended, row: try XCTUnwrap(annaRow(run.today)))
        XCTAssertEqual(run.today.card?.todo.title, catalog["attendance.app.caughtUp"])
        XCTAssertEqual(run.today.card?.todo.chips, [])
    }

    func test_F025_Design_aClassWithAnOpenParticipantHasAChipThatOpensTheClass() async throws {
        var kracht = PersonalFixtures.kracht
        kracht.attendanceOpen = true
        var day = PersonalFixtures.sarah(items: [kracht], workspaceCount: 1, showsKindLabel: true)
        day.next = nil
        let run = await setup(day, now: PersonalFixtures.at("16:05"))
        let chip = try XCTUnwrap(run.today.card?.todo.chips.first)
        XCTAssertEqual(chip.text, String(format: catalog["attendance.app.chip"], "Kracht", "15:00"))
        XCTAssertEqual(PersonalRoute(chip.row), .classDate(workspaceID: PersonalFixtures.johns.id, id: "kracht"))
        XCTAssertNil(run.today.rows.first { $0.id == "kracht" }?.nudge, "a class has no inline buttons")
    }

    func test_F025_AC7_johnTakesAttendanceFromTheWorkspaceDay() async throws {
        let api = StubAPI()
        var anna = StudioFixtures.anna
        anna.clients = [self.anna]
        anna.attendanceOpen = true
        api.workspaceDay.serve(StudioFixtures.johnsDay(items: [StudioFixtures.mark, anna]))
        api.sessions.setTrainers([StudioFixtures.john, StudioFixtures.sarah], members: [])
        api.attendance.serve([.init(id: self.anna.clientId, name: "Anna de Vries", status: .booked)], type: ._private)
        let queue = AttendanceQueue(api: api, store: MemoryPersonalStore(), retryAfter: nil)
        let studio = StudioDayModel(
            api: api, catalog: Catalog(locale: language), now: { PersonalFixtures.at("19:05") }, attendance: queue
        )
        await studio.configure(workspace: StudioFixtures.workspace, canManage: true)
        await studio.select(.studio)

        let rows = studio.rows(at: PersonalFixtures.at("19:05"))
        let row = try XCTUnwrap(rows.first { $0.id == "anna" })
        XCTAssertEqual(row.nudge?.clientName, "Anna de Vries")
        XCTAssertNil(rows.first { $0.id == "mark" }?.nudge)

        studio.mark(.attended, row: row)
        await queue.flush()
        XCTAssertEqual(api.attendance.requests.map(\.status), ["attended"])
        XCTAssertEqual(queue.pending(sessionID: "anna").count, 0)
        XCTAssertNil(studio.rows(at: PersonalFixtures.at("19:05")).first { $0.id == "anna" }?.nudge)
    }

    func test_F025_agendaRowsShowNothingExtra() {
        var anna = PersonalFixtures.anna
        anna.attendanceOpen = true
        anna.clients = [self.anna]
        let row = PersonalRows(
            namesKinds: false, workspaceCount: 1, catalog: Catalog(locale: language), now: PersonalFixtures.at("10:05")
        ).row(anna)
        XCTAssertNil(row.nudge)
    }
}

import FivviAPI
import XCTest

@testable import FivviPro
@testable import FivviStrings
@testable import FivviLanguage

/// CO-05 and TD-02's attendance (F025 AC1, AC4, AC5, AC6, AC8, AC9 and *Iedereen aanwezig*): the participants as the API
/// has them, with the requests waiting in the offline queue laid over them. The test plan runs every test in nl and en.
@MainActor
final class AttendanceModelTests: XCTestCase {
    private let language = InterfaceLanguage.resolve(.system())
    private var catalog: TestCatalog { TestCatalog(language) }
    private let sessionID = AttendanceFixtures.sessionID

    private final class Online: @unchecked Sendable {
        var value = true
    }

    private struct Setup {
        let api: StubAPI
        let queue: AttendanceQueue
        let model: AttendanceModel
        let online: Online
    }

    private func setup(
        _ people: [AttendanceFixtures.Person] = AttendanceFixtures.people(),
        now: Date = AttendanceFixtures.started, type: Components.Schemas.Attendance._TypePayload = .group,
        cancelled: Bool = false, canTake: Bool = true, offline: Bool = false
    ) async -> Setup {
        let api = StubAPI()
        api.attendance.serve(
            people, type: type, opensAt: AttendanceFixtures.opensAt, canTake: canTake, cancelled: cancelled
        )
        let online = Online()
        online.value = !offline
        let queue = AttendanceQueue(
            api: api, store: MemoryPersonalStore(), isOnline: { online.value }, retryAfter: nil
        )
        let model = AttendanceModel(
            api: api, workspace: AttendanceFixtures.workspace, sessionID: sessionID,
            catalog: Catalog(locale: language), queue: queue, now: { now }
        )
        await model.load()
        return Setup(api: api, queue: queue, model: model, online: online)
    }

    private func status(_ model: AttendanceModel, _ name: String) -> AttendanceStatus? {
        model.rows.first { $0.clientID == AttendanceFixtures.id(name) }?.status
    }

    private func summary(_ attended: Int, _ noShow: Int, _ open: Int) -> String {
        String(format: catalog["attendance.summary"], String(attended), String(noShow), String(open))
    }

    func test_F025_AC4_theSummaryCountsAndUpdatesAfterEachTap() async {
        let run = await setup()
        XCTAssertEqual(run.model.state, .loaded)
        XCTAssertEqual(run.model.summaryText, summary(0, 0, 7))
        for name in AttendanceFixtures.names.prefix(5) { run.model.toggle(.attended, for: AttendanceFixtures.id(name)) }
        XCTAssertEqual(run.model.summaryText, summary(5, 0, 2), "the summary counts what the phone has")
        run.model.toggle(.noShow, for: AttendanceFixtures.id("Finn Smit"))
        XCTAssertEqual(run.model.summaryText, summary(5, 1, 1))
        await run.queue.flush()
        XCTAssertEqual(run.model.summaryText, summary(5, 1, 1), "and the same once the API has them")
        XCTAssertTrue(run.queue.entries.isEmpty)
        XCTAssertEqual(run.api.attendance.requests.count, 6)
    }

    func test_F025_AC1_tappingTheSelectedStatusAgainSetsItBackToBooked() async {
        let run = await setup(AttendanceFixtures.people(), type: ._private)
        let anna = AttendanceFixtures.id("Anna de Vries")
        run.model.toggle(.attended, for: anna)
        XCTAssertEqual(status(run.model, "Anna de Vries"), .attended)
        await run.queue.flush()
        run.model.toggle(.attended, for: anna)
        XCTAssertEqual(status(run.model, "Anna de Vries"), .booked)
        await run.queue.flush()
        XCTAssertEqual(run.api.attendance.requests.map(\.status), ["attended", "booked"])
        run.model.set(.noShow, for: anna)
        await run.queue.flush()
        XCTAssertEqual(status(run.model, "Anna de Vries"), .noShow, "the segmented control sets a status directly")
    }

    func test_F025_AC5_beforeTheWindowTheButtonsAreOffWithTheTimeAndATapDoesNothing() async {
        let run = await setup(now: AttendanceFixtures.early)
        XCTAssertFalse(run.model.canMark)
        XCTAssertEqual(run.model.tooEarlyText, String(format: catalog["attendance.tooEarly"], "17:30"))
        XCTAssertEqual(run.model.fromText, String(format: catalog["attendance.app.from"], "17:30"))
        XCTAssertFalse(run.model.canMarkEveryone)
        run.model.toggle(.attended, for: AttendanceFixtures.id("Anna de Vries"))
        XCTAssertTrue(run.queue.entries.isEmpty)

        let open = await setup(now: PersonalFixtures.at("17:30"))
        XCTAssertTrue(open.model.canMark, "from 17:30 it works")
        XCTAssertNil(open.model.tooEarlyText)
    }

    func test_F025_AC6_aCancelledClassNeedsNoAttendance() async {
        let run = await setup(cancelled: true)
        XCTAssertTrue(run.model.isCancelled)
        XCTAssertEqual(run.model.cancelledText, catalog["attendance.cancelledClass"])
        XCTAssertFalse(run.model.canMark)
        XCTAssertFalse(run.model.canMarkEveryone)
        let session = await setup(type: ._private, cancelled: true)
        XCTAssertEqual(session.model.cancelledText, catalog["attendance.cancelledSession"])
        XCTAssertEqual(session.model.cancelledNote, catalog["attendance.app.cancelled"])
    }

    func test_F025_AC6_aParticipantWhoCancelledCannotBeSet() async {
        let run = await setup(AttendanceFixtures.people(["Anna": .cancelled]))
        run.model.toggle(.attended, for: AttendanceFixtures.id("Anna de Vries"))
        XCTAssertTrue(run.queue.entries.isEmpty)
        XCTAssertEqual(status(run.model, "Anna de Vries"), .cancelled)
        XCTAssertEqual(run.model.summary.cancelled, 1)
    }

    func test_F025_AC7_aTrainerWhoMayNotTakeAttendanceHasNoButtons() async {
        let run = await setup(canTake: false)
        XCTAssertFalse(run.model.canMark)
        run.model.toggle(.attended, for: AttendanceFixtures.id("Anna de Vries"))
        XCTAssertTrue(run.queue.entries.isEmpty)
    }

    func test_F025_AC8_offlineTheRowsWaitForTheConnectionAndTheSummaryCountsThem() async {
        let run = await setup(offline: true)
        for name in AttendanceFixtures.names.prefix(3) { run.model.toggle(.attended, for: AttendanceFixtures.id(name)) }
        await run.queue.flush()
        let waiting = run.model.rows.filter(\.isPending)
        XCTAssertEqual(waiting.count, 3)
        XCTAssertTrue(run.model.rowsWaitForConnection)
        XCTAssertEqual(run.model.waitingText, catalog["attendance.app.waiting"])
        XCTAssertEqual(run.model.summaryText, summary(3, 0, 4))
        XCTAssertEqual(
            run.model.spokenLabel(waiting[0]),
            String(
                format: catalog["attendance.app.rowLabel"], "Anna de Vries",
                catalog["attendance.status.attended"].lowercased()
            )
                + ", " + catalog["attendance.app.waiting"].lowercased()
        )

        run.online.value = true
        await run.queue.flush()
        XCTAssertTrue(run.model.rows.allSatisfy { !$0.isPending }, "after syncing the label goes away")
        XCTAssertEqual(run.model.summaryText, summary(3, 0, 4))
    }

    func test_F025_AC9_aQueuedTapOnACancelledSessionRevertsWithTheMessage() async {
        let run = await setup(offline: true)
        let anna = AttendanceFixtures.id("Anna de Vries")
        run.model.toggle(.attended, for: anna)
        XCTAssertEqual(status(run.model, "Anna de Vries"), .attended)
        run.api.attendance.cancelSession()
        run.online.value = true
        await run.queue.flush()
        await run.model.refresh()

        XCTAssertEqual(status(run.model, "Anna de Vries"), .booked, "the row is back")
        XCTAssertEqual(run.model.rows.first?.message, catalog["attendance.cancelledClass"])
        XCTAssertEqual(run.model.refusals, 1)
        XCTAssertEqual(run.model.cancelledText, catalog["attendance.cancelledClass"])
        // A cancelled session takes no more taps.
        run.model.toggle(.attended, for: anna)
        XCTAssertTrue(run.queue.entries.isEmpty)
    }

    func test_F025_aRefusedTapOfAParticipantWhoCancelledMeanwhileSaysSo() async {
        let run = await setup()
        run.api.attendance.fail(.participantCancelled)
        run.model.toggle(.attended, for: AttendanceFixtures.id("Anna de Vries"))
        await run.queue.flush()
        XCTAssertEqual(run.model.rows.first?.message, catalog["attendance.errors.participantCancelled"])
    }

    func test_F025_aTapRefusedAsTooEarlyNamesTheTimeTheWindowOpens() async {
        let run = await setup()
        run.api.attendance.fail(.tooEarly(AttendanceFixtures.opensAt))
        run.model.toggle(.attended, for: AttendanceFixtures.id("Anna de Vries"))
        await run.queue.flush()
        XCTAssertEqual(run.model.rows.first?.message, String(format: catalog["attendance.tooEarly"], "17:30"))
    }

    func test_F025_IedereenAanwezig_marksTheOpenRowsAndLeavesNoShowAndCancelled() async {
        let run = await setup(AttendanceFixtures.people(["Anna": .noShow, "Bram": .cancelled]))
        XCTAssertTrue(run.model.canMarkEveryone)
        run.model.markEveryone()
        XCTAssertEqual(status(run.model, "Anna de Vries"), .noShow, "a no-show stays")
        XCTAssertEqual(status(run.model, "Bram Jansen"), .cancelled, "a cancelled participant stays")
        XCTAssertEqual(AttendanceFixtures.names.dropFirst(2).filter { status(run.model, $0) == .attended }.count, 5)
        XCTAssertEqual(run.model.summaryText, summary(5, 1, 0))
        await run.queue.flush()
        XCTAssertEqual(run.api.attendance.requests.count, 1, "one request for all of them")
        XCTAssertNil(run.api.attendance.requests[0].clientID)
        XCTAssertEqual(run.model.summaryText, summary(5, 1, 0))
        XCTAssertFalse(run.model.canMarkEveryone, "nobody is left open")
    }

    func test_F025_IedereenAanwezigOffline_theFiveOpenRowsWaitAndAnnaStays() async {
        let run = await setup(AttendanceFixtures.people(["Anna": .noShow]), offline: true)
        run.model.toggle(.attended, for: AttendanceFixtures.id("Bram Jansen"))
        run.model.markEveryone()
        await run.queue.flush()
        XCTAssertEqual(run.queue.entries.count, 2, "one queued request, after the tap queued before it")
        let rows = run.model.rows
        XCTAssertEqual(rows.filter { $0.status == .attended && $0.isPending }.count, 6)
        XCTAssertEqual(rows.first { $0.name == "Anna de Vries" }?.status, .noShow)
        XCTAssertEqual(rows.first { $0.name == "Anna de Vries" }?.isPending, false)
    }

    func test_F025_IedereenAanwezigOffline_whenTheSyncRejectsItTheRowsRevertWithTheMessage() async {
        let run = await setup(AttendanceFixtures.people(["Anna": .noShow]), offline: true)
        run.model.markEveryone()
        run.api.attendance.fail(.sessionCancelled)
        run.online.value = true
        await run.queue.flush()
        await run.model.refresh()
        let reverted = run.model.rows.filter { $0.name != "Anna de Vries" }
        XCTAssertEqual(reverted.count, 6)
        let message = catalog["attendance.cancelledClass"]
        XCTAssertTrue(reverted.allSatisfy { $0.status == .booked && $0.message == message })
        XCTAssertNil(run.model.rows.first { $0.name == "Anna de Vries" }?.message)
    }

    func test_F025_IedereenAanwezigOffline_aRowChangedMeanwhileOnAnotherDeviceTakesTheServersStatus() async {
        let run = await setup(offline: true)
        run.model.markEveryone()
        run.api.attendance.change(AttendanceFixtures.id("Chris Bakker"), to: .noShow)
        run.online.value = true
        await run.queue.flush()
        XCTAssertEqual(status(run.model, "Chris Bakker"), .noShow, "the answer shows it otherwise")
        XCTAssertEqual(status(run.model, "Dana Visser"), .attended)
    }

    func test_F025_aScreenThatReadsAgainDropsTheAnswerTheQueueKept() async {
        let run = await setup()
        run.model.toggle(.attended, for: AttendanceFixtures.id("Anna de Vries"))
        await run.queue.flush()
        XCTAssertNotNil(run.queue.answers[sessionID])
        await run.model.refresh()
        XCTAssertNil(run.queue.answers[sessionID])
        XCTAssertEqual(status(run.model, "Anna de Vries"), .attended)
    }
}

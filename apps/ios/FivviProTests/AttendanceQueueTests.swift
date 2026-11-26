import FivviAPI
import XCTest

@testable import FivviPro

/// F025's offline queue (AC8, AC9 and *Iedereen aanwezig* offline, owner 9 November 2026): every tap is a request with a
/// client request ID, kept on the phone, sent in order when it is online, refused ones leave with their reason.
@MainActor
final class AttendanceQueueTests: XCTestCase {
    private let workspaceID = AttendanceFixtures.workspace.id
    private let session = AttendanceFixtures.sessionID

    private final class Online: @unchecked Sendable {
        var value = true
    }

    private final class Counter: @unchecked Sendable {
        var count = 0
    }

    private func queue(
        _ api: StubAPI, store: MemoryPersonalStore = MemoryPersonalStore(), online: Online = Online()
    ) -> AttendanceQueue {
        let counter = Counter()
        return AttendanceQueue(
            api: api, store: store, isOnline: { online.value },
            makeID: {
                counter.count += 1
                return "request-\(counter.count)"
            },
            retryAfter: nil
        )
    }

    private func served() -> StubAPI {
        let api = StubAPI()
        api.attendance.serve(AttendanceFixtures.people())
        return api
    }

    private func tap(_ queue: AttendanceQueue, _ name: String, _ status: AttendanceStatus) {
        queue.enqueue(
            workspaceID: workspaceID, sessionID: session,
            .set(clientID: AttendanceFixtures.id(name), status: status.request ?? .booked)
        )
    }

    func test_F025_AC8_threeOfflineTapsSurviveARestartAndAreSentInOrderOnceBackOnline() async {
        let api = served()
        let store = MemoryPersonalStore()
        let online = Online()
        online.value = false
        let first = queue(api, store: store, online: online)
        tap(first, "Anna de Vries", .attended)
        tap(first, "Bram Jansen", .noShow)
        tap(first, "Chris Bakker", .attended)
        await first.flush()
        XCTAssertEqual(first.entries.count, 3, "offline: nothing is sent and nothing is lost")
        XCTAssertTrue(first.waitsForConnection)
        XCTAssertTrue(api.attendance.requests.isEmpty)

        // The app is closed and opened again: a new queue reads the phone's file.
        online.value = true
        let reopened = queue(api, store: store, online: online)
        XCTAssertEqual(reopened.entries.map(\.id), first.entries.map(\.id), "the same requests, with the same IDs")
        await reopened.flush()

        XCTAssertEqual(
            api.attendance.requests.map(\.clientID),
            ["Anna de Vries", "Bram Jansen", "Chris Bakker"].map(AttendanceFixtures.id), "sent in order"
        )
        XCTAssertEqual(api.attendance.requests.map(\.status), ["attended", "no_show", "attended"])
        XCTAssertEqual(api.attendance.requests.map(\.surface), ["ios", "ios", "ios"])
        XCTAssertEqual(Set(api.attendance.requests.map(\.clientRequestID)).count, 3, "one ID for each tap")
        XCTAssertTrue(reopened.entries.isEmpty)
        XCTAssertFalse(reopened.waitsForConnection)
        XCTAssertEqual(store.read("attendance-queue.json").flatMap { String(data: $0, encoding: .utf8) }, "[]")
    }

    func test_F025_AC8_aRequestThatDidNotGetThroughIsSentAgainWithTheSameID() async {
        let api = served()
        api.attendance.fail(.offline)
        let queue = queue(api)
        tap(queue, "Anna de Vries", .attended)
        tap(queue, "Bram Jansen", .attended)
        await queue.flush()
        XCTAssertTrue(queue.isStalled)
        XCTAssertTrue(queue.waitsForConnection, "the phone says online, but the request did not get through")
        XCTAssertEqual(queue.entries.count, 2, "nothing is lost, and nothing behind the first one is sent")
        XCTAssertEqual(api.attendance.requests.count, 1)

        api.attendance.fail(nil)
        await queue.flush()

        XCTAssertTrue(queue.entries.isEmpty)
        XCTAssertFalse(queue.isStalled)
        let ids = api.attendance.requests.map(\.clientRequestID)
        XCTAssertEqual(ids, ["request-1", "request-1", "request-2"], "the retry carries the ID of the first try")
    }

    func test_F025_AC9_aRequestTheApiRefusesLeavesTheQueueWithItsReason() async {
        let api = served()
        api.attendance.fail(.sessionCancelled)
        let queue = queue(api)
        tap(queue, "Anna de Vries", .attended)
        await queue.flush()

        XCTAssertTrue(queue.entries.isEmpty, "a refused tap is not sent again")
        XCTAssertEqual(
            queue.rejections(sessionID: session).map(\.reason), [.sessionCancelled]
        )
        XCTAssertEqual(queue.rejections(sessionID: session).first?.clientIDs, [AttendanceFixtures.id("Anna de Vries")])
        XCTAssertEqual(queue.revision, 1)
        XCTAssertNil(queue.answers[session])
    }

    func test_F025_AC9_aFourHundredTheContractDoesNotListIsARefusalAndTheQueueGoesOn() async {
        let api = served()
        api.attendance.fail(.undocumented(418))
        let queue = queue(api)
        tap(queue, "Anna de Vries", .attended)
        await queue.flush()
        XCTAssertTrue(queue.entries.isEmpty, "the queue is not stuck behind the bad request")
        api.attendance.fail(nil)
        tap(queue, "Bram Jansen", .attended)
        await queue.flush()

        XCTAssertTrue(queue.entries.isEmpty)
        XCTAssertFalse(queue.isStalled)
        XCTAssertEqual(queue.rejections(sessionID: session).first?.reason, .other)
        XCTAssertEqual(queue.rejections(sessionID: session).first?.clientIDs, [AttendanceFixtures.id("Anna de Vries")])
        XCTAssertEqual(api.attendance.requests.map(\.clientID).last, AttendanceFixtures.id("Bram Jansen"))
    }

    func test_F025_AC9_aBodyThatDoesNotDecodeIsARefusalAndTheQueueGoesOn() async {
        let api = served()
        api.attendance.fail(.malformed)
        let queue = queue(api)
        tap(queue, "Anna de Vries", .attended)
        await queue.flush()
        XCTAssertTrue(queue.entries.isEmpty)
        XCTAssertEqual(queue.rejections(sessionID: session).map(\.reason), [.other])
        api.attendance.fail(nil)
        tap(queue, "Bram Jansen", .attended)
        await queue.flush()
        XCTAssertEqual(api.attendance.requests.count, 2, "later taps go on")
        XCTAssertTrue(queue.entries.isEmpty)
    }

    func test_F025_AC8_aServerErrorStaysInTheQueueAndIsSentAgain() async {
        let api = served()
        api.attendance.fail(.undocumented(503))
        let queue = queue(api)
        tap(queue, "Anna de Vries", .attended)
        await queue.flush()
        XCTAssertEqual(queue.entries.count, 1)
        XCTAssertTrue(queue.isStalled)
        XCTAssertTrue(queue.rejections(sessionID: session).isEmpty)
    }

    func test_F025_AC5_aRequestThatIsTooEarlyLeavesWithTheTimeTheWindowOpens() async {
        let api = served()
        api.attendance.fail(.tooEarly(AttendanceFixtures.opensAt))
        let queue = queue(api)
        tap(queue, "Anna de Vries", .attended)
        await queue.flush()
        XCTAssertEqual(
            queue.rejections(sessionID: session).map(\.reason), [.tooEarly(opensAt: AttendanceFixtures.opensAt)]
        )
    }

    func test_F025_IedereenAanwezigOffline_isOneRequestInOrderWithTheTapsAroundIt() async {
        let api = served()
        api.attendance.serve(AttendanceFixtures.people(["Anna": .noShow]))
        let store = MemoryPersonalStore()
        let online = Online()
        online.value = false
        let first = queue(api, store: store, online: online)
        tap(first, "Bram Jansen", .noShow)
        first.enqueue(
            workspaceID: workspaceID, sessionID: session,
            .everyone(clientIDs: AttendanceFixtures.names.dropFirst(2).map(AttendanceFixtures.id))
        )
        tap(first, "Chris Bakker", .booked)
        await first.flush()
        XCTAssertEqual(first.entries.count, 3, "Iedereen aanwezig is one request, not one per row")

        online.value = true
        let reopened = queue(api, store: store, online: online)
        XCTAssertEqual(reopened.entries.count, 3, "it survives an app restart")
        await reopened.flush()
        await reopened.flush()

        let requests = api.attendance.requests
        XCTAssertEqual(requests.map(\.clientRequestID), ["request-1", "request-2", "request-3"], "sent once, in order")
        XCTAssertEqual(
            requests.map(\.clientID),
            [AttendanceFixtures.id("Bram Jansen"), nil, AttendanceFixtures.id("Chris Bakker")]
        )
        XCTAssertEqual(requests[1].surface, "ios")
        XCTAssertTrue(reopened.entries.isEmpty)
    }

    func test_F025_IedereenAanwezigOffline_whenTheSyncRejectsItTheRowsItChangedAreNamed() async {
        let api = served()
        api.attendance.fail(.sessionCancelled)
        let queue = queue(api)
        let open = AttendanceFixtures.names.dropFirst().map(AttendanceFixtures.id)
        queue.enqueue(workspaceID: workspaceID, sessionID: session, .everyone(clientIDs: open))
        await queue.flush()
        XCTAssertEqual(queue.rejections(sessionID: session).first?.clientIDs, open, "every row it changed reverts")
    }

    func test_F025_theLastAnswerOfASessionIsKeptUntilItsScreenReadsAgain() async {
        let api = served()
        let queue = queue(api)
        tap(queue, "Anna de Vries", .attended)
        await queue.flush()
        XCTAssertEqual(queue.answers[session]?.summary.attended, 1)
        queue.forgetAnswer(sessionID: session)
        XCTAssertNil(queue.answers[session])
    }

    func test_F025_signingOutClearsWhatWaits() async {
        let api = served()
        let store = MemoryPersonalStore()
        let online = Online()
        online.value = false
        let queue = queue(api, store: store, online: online)
        tap(queue, "Anna de Vries", .attended)
        queue.clear()
        XCTAssertTrue(queue.entries.isEmpty)
        XCTAssertNil(store.read("attendance-queue.json"))
    }
}

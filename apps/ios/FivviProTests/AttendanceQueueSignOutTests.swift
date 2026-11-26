import FivviAPI
import FivviSession
import XCTest

@testable import FivviPro

/// #1618, spec #460: the attendance queue and the end of a sign-in. The sign-out the person chose (after the warning)
/// empties it for good; a token the API rejected keeps the taps for the same account; no tap is ever sent under another
/// account, and none vanishes without a trace. The Android part is covered by the Android slice (#1620).
@MainActor
final class AttendanceQueueSignOutTests: XCTestCase {
    private let workspaceID = AttendanceFixtures.workspace.id
    private let session = AttendanceFixtures.sessionID
    private let file = "attendance-queue.json"

    private final class Online: @unchecked Sendable {
        var value = true
    }

    private func served() -> StubAPI {
        let api = StubAPI()
        api.attendance.serve(AttendanceFixtures.people())
        return api
    }

    /// A phone: its Keychain, the attendance file and the network, shared by every queue (every app start) of a test.
    private struct Phone {
        let api: StubAPI
        let tokens: InMemorySessionStore
        let files = MemoryPersonalStore()
        let online = Online()
    }

    private func phone(token: String? = "token-a") -> Phone {
        Phone(api: served(), tokens: InMemorySessionStore(token: token))
    }

    private func queue(_ phone: Phone, ids: String = "request") -> AttendanceQueue {
        AttendanceQueue(
            api: phone.api, store: phone.files, isOnline: { phone.online.value },
            makeID: { "\(ids)-\(UUID().uuidString.prefix(4))" }, retryAfter: nil,
            signIn: { [tokens = phone.tokens] in tokens.token.map(SignInFingerprint.of) }
        )
    }

    private func tap(_ queue: AttendanceQueue, _ name: String, _ status: AttendanceStatus = .attended) {
        queue.enqueue(
            workspaceID: workspaceID, sessionID: session,
            .set(clientID: AttendanceFixtures.id(name), status: status.request ?? .booked)
        )
    }

    /// The API rejects the token: the app deletes it and signs out, without the warning and without `clear()`.
    private func tokenRejected(_ phone: Phone) { phone.tokens.deleteToken() }

    private func signIn(_ phone: Phone, token: String, account: String) async {
        try? phone.tokens.save(token: token)
        await phone.api.answerMe(with: .account(email: "x@example.com", id: account))
    }

    private func waitForRequestInFlight(_ api: StubAPI) async {
        for _ in 0 ..< 500 where api.attendance.waitingCount == 0 { try? await Task.sleep(for: .milliseconds(10)) }
        XCTAssertEqual(api.attendance.waitingCount, 1, "a send is running")
    }

    // MARK: AC1: the sign-out the person chose

    func test_F025_1618_signingOutWithTapsWaitingEmptiesTheQueueInMemoryAndOnDisk() {
        let phone = phone()
        phone.online.value = false
        let queue = queue(phone)
        tap(queue, "Anna de Vries")
        tap(queue, "Bram Jansen")
        XCTAssertEqual(queue.entries.count, 2)
        XCTAssertNotNil(phone.files.read(file), "the taps are on the phone")

        queue.clear()

        XCTAssertTrue(queue.entries.isEmpty)
        XCTAssertNil(phone.files.read(file), "and gone from the phone")
        XCTAssertTrue(self.queue(phone).entries.isEmpty, "the next start reads nothing")
    }

    func test_F025_1618_aSendStillRunningAtSignOutDoesNotWriteTheTapsBack() async {
        let phone = phone()
        let queue = queue(phone)
        phone.api.attendance.hold()
        tap(queue, "Anna de Vries")
        tap(queue, "Bram Jansen")
        await waitForRequestInFlight(phone.api)

        phone.tokens.deleteToken()
        queue.clear()
        phone.api.attendance.release()
        await queue.flush()

        XCTAssertTrue(queue.entries.isEmpty)
        XCTAssertNil(phone.files.read(file), "the answer of the running send does not save the queue again")
        XCTAssertEqual(phone.api.attendance.requests.count, 1, "and the tap behind it is not sent")
    }

    // MARK: AC2: nothing of the earlier account goes out after another sign-in

    func test_F025_1618_noTapOfTheEarlierAccountIsSentAfterAnotherSignIn() async {
        let phone = phone()
        phone.online.value = false
        let first = queue(phone)
        tap(first, "Anna de Vries")
        tap(first, "Bram Jansen")
        phone.tokens.deleteToken()
        first.clear()

        await signIn(phone, token: "token-b", account: "account-b")
        phone.online.value = true
        let second = queue(phone)
        second.learn(account: "account-b")
        await second.flush()

        XCTAssertTrue(second.entries.isEmpty)
        XCTAssertTrue(phone.api.attendance.requests.isEmpty, "nothing of the earlier account is sent")
    }

    func test_F025_1618_aSendRunningWhenAnotherAccountSignsInDoesNotGoOnWithTheTapsBehindIt() async {
        let phone = phone()
        let queue = queue(phone)
        phone.api.attendance.hold()
        tap(queue, "Anna de Vries")
        tap(queue, "Bram Jansen")
        await waitForRequestInFlight(phone.api)

        phone.tokens.deleteToken()
        queue.clear()
        await signIn(phone, token: "token-b", account: "account-b")
        phone.api.attendance.release()
        await queue.flush()

        XCTAssertEqual(phone.api.attendance.requests.count, 1, "the second tap is not sent with the new token")
        XCTAssertNil(phone.files.read(file))
    }

    // MARK: AC3: a rejected token keeps the taps for the same account

    func test_F025_1618_aRejectedTokenKeepsTheTapsAndTheSameAccountSendsThemInOrderAfterSigningInAgain() async {
        let phone = phone()
        phone.online.value = false
        let first = queue(phone)
        first.learn(account: "account-a")
        tap(first, "Anna de Vries")
        tap(first, "Bram Jansen", .noShow)
        tokenRejected(phone)
        XCTAssertNotNil(phone.files.read(file), "a rejected token does not clear the file")

        await signIn(phone, token: "token-a2", account: "account-a")
        phone.online.value = true
        let second = queue(phone)
        XCTAssertTrue(second.entries.isEmpty, "out of sight (not in the sign-out warning) until the account is known")
        second.learn(account: "account-a")
        XCTAssertEqual(second.entries.count, 2)
        await second.flush()

        XCTAssertEqual(
            phone.api.attendance.requests.map(\.clientID),
            ["Anna de Vries", "Bram Jansen"].map(AttendanceFixtures.id), "sent, in order"
        )
        XCTAssertTrue(second.entries.isEmpty)
        XCTAssertEqual(phone.files.read(file).flatMap { String(data: $0, encoding: .utf8) }, "[]")
    }

    func test_F025_1618_theTapsOfARejectedTokenGoBeforeTheNewOnesEvenWhenTheAccountIsReadByTheQueue() async {
        let phone = phone()
        phone.online.value = false
        let first = queue(phone)
        first.learn(account: "account-a")
        tap(first, "Anna de Vries", .attended)
        tokenRejected(phone)

        await signIn(phone, token: "token-a2", account: "account-a")
        phone.online.value = true
        let second = queue(phone)
        tap(second, "Anna de Vries", .noShow)
        await second.flush()

        XCTAssertEqual(phone.api.attendance.requests.map(\.status), ["attended", "no_show"], "the older tap first")
    }

    func test_F025_1618_aRejectedTokenDoesNotHandTheTapsToAnotherAccount() async {
        let phone = phone()
        phone.online.value = false
        let first = queue(phone)
        first.learn(account: "account-a")
        tap(first, "Anna de Vries")
        tokenRejected(phone)

        await signIn(phone, token: "token-b", account: "account-b")
        phone.online.value = true
        let second = queue(phone)
        second.learn(account: "account-b")
        await second.flush()

        XCTAssertTrue(phone.api.attendance.requests.isEmpty, "never sent under another account")
        XCTAssertTrue(second.entries.isEmpty)
        XCTAssertEqual(
            phone.files.read(file).flatMap { String(data: $0, encoding: .utf8) }, "[]", "and gone from the phone"
        )
    }

    func test_F025_1618_aTapMadeBeforeTheAccountWasKnownBelongsToTheAccountThatAnswersLater() async {
        let phone = phone()
        phone.online.value = false
        let first = queue(phone)
        tap(first, "Anna de Vries")
        first.learn(account: "account-a")
        tokenRejected(phone)

        await signIn(phone, token: "token-a2", account: "account-a")
        phone.online.value = true
        let second = queue(phone)
        second.learn(account: "account-a")
        await second.flush()

        XCTAssertEqual(phone.api.attendance.requests.map(\.clientID), [AttendanceFixtures.id("Anna de Vries")])
    }

    func test_F025_1618_aTapMadeBeforeTheAccountWasKnownIsNeverSentUnderAnotherAccountAndTheRowSaysSo() async {
        let phone = phone()
        phone.online.value = false
        let first = queue(phone)
        tap(first, "Anna de Vries")
        tokenRejected(phone)

        await signIn(phone, token: "token-b", account: "account-b")
        phone.online.value = true
        let second = queue(phone)
        second.learn(account: "account-b")
        await second.flush()

        XCTAssertTrue(phone.api.attendance.requests.isEmpty, "whose tap it was cannot be said, so it is not sent")
        XCTAssertEqual(second.rejections(sessionID: session).map(\.reason), [.other], "the row reverts, worded")
        XCTAssertEqual(
            second.rejections(sessionID: session).first?.clientIDs, [AttendanceFixtures.id("Anna de Vries")]
        )
        XCTAssertEqual(phone.files.read(file).flatMap { String(data: $0, encoding: .utf8) }, "[]")
    }

    func test_F025_1618_aTapMadeBeforeTheAccountWasKnownIsNotSentWhenTheSameAccountSignsInAgainAndItsRowSaysSo() async {
        // The tap's sign-in never learned its account, so the next sign-in cannot tell it is the same one: the tap is not
        // sent and the row says so, instead of vanishing.
        let phone = phone()
        phone.online.value = false
        let first = queue(phone)
        tap(first, "Anna de Vries")
        tokenRejected(phone)

        await signIn(phone, token: "token-a2", account: "account-a")
        phone.online.value = true
        let second = queue(phone)
        second.learn(account: "account-a")
        await second.flush()

        XCTAssertTrue(phone.api.attendance.requests.isEmpty)
        XCTAssertEqual(second.rejections(sessionID: session).map(\.reason), [.other])
    }

    func test_F025_1618_theQueueAsksWhoSignedInBeforeItSendsWhatAnEarlierSignInLeft() async {
        let phone = phone()
        phone.online.value = false
        let first = queue(phone)
        first.learn(account: "account-a")
        tap(first, "Anna de Vries")
        tokenRejected(phone)

        // The same account signs in again; the app did not get to read its account (offline start, then online).
        await signIn(phone, token: "token-a2", account: "account-a")
        let second = queue(phone)
        phone.online.value = true
        await second.flush()

        XCTAssertEqual(phone.api.attendance.requests.map(\.clientID), [AttendanceFixtures.id("Anna de Vries")])
        XCTAssertTrue(second.entries.isEmpty)
    }

    func test_F025_1618_whenTheAccountCannotBeReadTheEarlierSignInsTapsWaitAndNothingGoesOut() async {
        let phone = phone()
        phone.online.value = false
        let first = queue(phone)
        first.learn(account: "account-a")
        tap(first, "Anna de Vries")
        tokenRejected(phone)

        await signIn(phone, token: "token-b", account: "account-b")
        await phone.api.answerMe(with: .offline)
        phone.online.value = true
        let second = queue(phone)
        tap(second, "Bram Jansen")
        await second.flush()

        XCTAssertTrue(phone.api.attendance.requests.isEmpty, "not even the new tap goes before the order is settled")
        XCTAssertTrue(second.isStalled)
        XCTAssertEqual(second.entries.count, 1)
        XCTAssertNotNil(phone.files.read(file))
        let stored = String(data: phone.files.read(file) ?? Data(), encoding: .utf8) ?? ""
        XCTAssertTrue(stored.contains(AttendanceFixtures.id("Anna de Vries")), "the earlier tap stays in the file")
    }

    func test_F025_1618_aFileOfAnOlderAppIsTheOpenSignInsQueue() {
        let phone = phone()
        phone.online.value = false
        let first = queue(phone)
        tap(first, "Anna de Vries")
        // An older app wrote the entries without a sign-in or an account.
        let data = try? XCTUnwrap(phone.files.read(file))
        let objects = (try? JSONSerialization.jsonObject(with: data ?? Data())) as? [[String: Any]] ?? []
        let stripped = objects.map { $0.filter { $0.key != "signIn" && $0.key != "account" } }
        phone.files.write((try? JSONSerialization.data(withJSONObject: stripped)) ?? Data(), as: file)

        let reopened = queue(phone)

        XCTAssertEqual(reopened.entries.count, 1)
    }
}

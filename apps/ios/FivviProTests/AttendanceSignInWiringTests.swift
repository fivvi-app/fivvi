import FivviAPI
import FivviLanguage
import FivviSession
import FivviUI
import XCTest

@testable import FivviPro

/// #1618: how the app ties the attendance queue to the sign-in. The queue's own rules are in
/// `AttendanceQueueSignOutTests`; these go through what the home and the app build (`AccountViewModel`, `AppSignIn` with
/// the generated client's `AuthMiddleware`), so they fail when that wiring breaks: the sign-out the person chose empties
/// the queue file as it starts, a rejected token leaves it, and the account `GET /api/v1/me` names reaches the queue.
@MainActor
final class AttendanceSignInWiringTests: XCTestCase {
    private let file = "attendance-queue.json"
    private let session = AttendanceFixtures.sessionID

    private final class Online: @unchecked Sendable {
        var value = true
    }

    private struct Phone {
        let api: StubAPI
        let tokens: InMemorySessionStore
        let queueFiles = MemoryPersonalStore()
        let personalFiles = MemoryPersonalStore()
        let online = Online()
    }

    private func phone() -> Phone {
        let api = StubAPI()
        api.attendance.serve(AttendanceFixtures.people())
        return Phone(api: api, tokens: InMemorySessionStore(token: "token-a"))
    }

    private func queue(_ phone: Phone) -> AttendanceQueue {
        AttendanceQueue(
            api: phone.api, store: phone.queueFiles, isOnline: { phone.online.value }, retryAfter: nil,
            signIn: { [tokens = phone.tokens] in tokens.token.map(SignInFingerprint.of) }
        )
    }

    private func account(
        _ phone: Phone, queue: AttendanceQueue, clock: ManualClock = ManualClock()
    ) -> AccountViewModel {
        AccountViewModel(
            api: phone.api, store: phone.tokens, queue: queue, clock: clock, signOutTimeout: .seconds(10),
            onAccount: { _ in }, onSignedOut: { _ in }
        )
    }

    private func tap(_ queue: AttendanceQueue, _ name: String) {
        queue.enqueue(
            workspaceID: AttendanceFixtures.workspace.id, sessionID: session,
            .set(clientID: AttendanceFixtures.id(name), status: .attended)
        )
    }

    private func waitingPhone() -> (Phone, AttendanceQueue) {
        let phone = phone()
        phone.online.value = false
        let queue = queue(phone)
        tap(queue, "Anna de Vries")
        tap(queue, "Bram Jansen")
        XCTAssertNotNil(phone.queueFiles.read(file), "the taps are on the phone")
        return (phone, queue)
    }

    /// The generated client with the app's middleware, on a transport that answers 401 to everything.
    private func rejectingClient(_ signIn: AppSignIn) -> Client {
        Client(
            serverURL: URL(string: "https://example.com/api")!,
            transport: StubTransport(status: .unauthorized, json: #"{"code":"not_signed_in"}"#),
            middlewares: [signIn.auth]
        )
    }

    // MARK: AC1: the sign-out the person chose

    func test_F025_1618_signingOutThroughTheAccountEmptiesTheQueueAndItsFile() async {
        let (phone, queue) = waitingPhone()

        await account(phone, queue: queue).signOut()

        XCTAssertTrue(queue.entries.isEmpty)
        XCTAssertNil(phone.queueFiles.read(file))
        XCTAssertTrue(self.queue(phone).entries.isEmpty, "the next start reads nothing")
    }

    func test_F025_1618_theQueueIsEmptiedAsTheSignOutStartsNotAfterItsRequest() async {
        let (phone, queue) = waitingPhone()
        await phone.api.answerSignOut(with: .hang)
        let account = account(phone, queue: queue)

        let signingOut = Task { await account.signOut() }
        await phone.api.untilSignOutHangs()

        XCTAssertNil(phone.queueFiles.read(file), "an app killed now has no taps left on the phone")
        XCTAssertTrue(queue.entries.isEmpty)
        await phone.api.releaseHangingSignOuts()
        await signingOut.value
    }

    // MARK: AC3: a rejected token keeps the taps

    func test_F025_1618_aTokenTheApiRejectsLeavesTheQueueFileAndTheSameAccountSendsItAfterSigningInAgain()
        async throws {
        let (phone, queue) = waitingPhone()
        queue.learn(account: "account-a")
        let signIn = AppSignIn(
            store: phone.tokens, files: PhoneFiles(personal: phone.personalFiles, attendance: phone.queueFiles),
            clearReportingUser: {}
        )
        phone.personalFiles.write(Data("day".utf8), as: "day.json")
        let client = rejectingClient(signIn)

        _ = try await client.getMe()

        XCTAssertEqual(signIn.session.state, .signedOut(afterRejection: true))
        XCTAssertNil(phone.tokens.token)
        XCTAssertNil(phone.personalFiles.read("day.json"), "what the personal screens keep still goes")
        XCTAssertNotNil(phone.queueFiles.read(file), "the taps stay on the phone")

        try phone.tokens.save(token: "token-a2")
        await phone.api.answerMe(with: .account(email: "x@example.com", id: "account-a"))
        phone.online.value = true
        let next = self.queue(phone)
        phone.online.value = false
        let account = account(phone, queue: next)
        await account.load()
        XCTAssertEqual(next.entries.count, 2, "the account the home read reached the queue, which took the taps")
        phone.online.value = true
        await next.flush()

        XCTAssertEqual(
            phone.api.attendance.requests.map(\.clientID), ["Anna de Vries", "Bram Jansen"].map(AttendanceFixtures.id),
            "the taps went out in order"
        )
    }

    func test_F025_1618_aTokenTheApiRejectsDoesNotHandTheTapsToAnotherAccount() async throws {
        let (phone, queue) = waitingPhone()
        queue.learn(account: "account-a")
        let signIn = AppSignIn(
            store: phone.tokens, files: PhoneFiles(personal: phone.personalFiles, attendance: phone.queueFiles),
            clearReportingUser: {}
        )
        let client = rejectingClient(signIn)
        _ = try await client.getMe()

        try phone.tokens.save(token: "token-b")
        await phone.api.answerMe(with: .account(email: "y@example.com", id: "account-b"))
        phone.online.value = true
        let next = self.queue(phone)
        await account(phone, queue: next).load()
        await next.flush()

        XCTAssertTrue(phone.api.attendance.requests.isEmpty)
    }

    // The file the production home writes its taps to is the file `AppSignIn` hands out, so what a rejected token does
    // to the sign-in's files is what it does to the home's queue: re-adding an attendance clear there fails this.
    func test_F025_1618_theHomeQueuesItsTapsInTheFileOfAppSignInAndATokenTheApiRejectsLeavesThem() async throws {
        let phone = phone()
        phone.api.attendance.fail(.offline)
        let signIn = AppSignIn(
            store: phone.tokens, files: PhoneFiles(personal: phone.personalFiles, attendance: phone.queueFiles),
            clearReportingUser: {}
        )
        let language = AppLanguage(
            api: phone.api, store: phone.tokens, defaults: try emptyDefaults(),
            sources: LanguageSources(perApp: nil, device: ["nl-NL"])
        )
        let home = HomeView(
            api: phone.api, store: phone.tokens, language: language, connectivity: Connectivity(),
            welcomeURL: URL(string: "https://example.com")!, onAccount: { _ in }, onSignedOut: { _ in },
            files: signIn.files
        )

        tap(home.attendance, "Anna de Vries")
        XCTAssertNotNil(phone.queueFiles.read(file), "the home keeps the taps in the file of the sign-in's files")
        _ = try await rejectingClient(signIn).getMe()

        XCTAssertEqual(signIn.session.state, .signedOut(afterRejection: true))
        XCTAssertNotNil(phone.queueFiles.read(file), "the rejected token leaves the home's taps on the phone")
    }
}

import FivviAPI
import FivviSession
import XCTest

@testable import FivviPro

/// What the tests of the attendance queue and the end of a sign-in (#1618) share: a phone with its Keychain, its
/// attendance file and its network, which every queue (every app start) of a test shares.
@MainActor
class AttendanceQueuePhoneTestCase: XCTestCase {
    let workspaceID = AttendanceFixtures.workspace.id
    let session = AttendanceFixtures.sessionID
    let file = "attendance-queue.json"

    final class Online: @unchecked Sendable {
        var value = true
    }

    func served() -> StubAPI {
        let api = StubAPI()
        api.attendance.serve(AttendanceFixtures.people())
        return api
    }

    /// A phone: its Keychain, the attendance file and the network, shared by every queue (every app start) of a test.
    struct Phone {
        let api: StubAPI
        let tokens: InMemorySessionStore
        let files = MemoryPersonalStore()
        let online = Online()
    }

    func phone(token: String? = "token-a") -> Phone {
        Phone(api: served(), tokens: InMemorySessionStore(token: token))
    }

    func queue(_ phone: Phone, ids: String = "request") -> AttendanceQueue {
        AttendanceQueue(
            api: phone.api, store: phone.files, isOnline: { phone.online.value },
            makeID: { "\(ids)-\(UUID().uuidString.prefix(4))" }, retryAfter: nil,
            signIn: { [tokens = phone.tokens] in tokens.token.map(SignInFingerprint.of) }
        )
    }

    func tap(_ queue: AttendanceQueue, _ name: String, _ status: AttendanceStatus = .attended) {
        queue.enqueue(
            workspaceID: workspaceID, sessionID: session,
            .set(clientID: AttendanceFixtures.id(name), status: status.request ?? .booked)
        )
    }

    /// The API rejects the token: the app deletes it and signs out, without the warning and without `clear()`.
    func tokenRejected(_ phone: Phone) { phone.tokens.deleteToken() }

    func signIn(_ phone: Phone, token: String, account: String) async {
        try? phone.tokens.save(token: token)
        await phone.api.answerMe(with: .account(email: "x@example.com", id: account))
    }
}

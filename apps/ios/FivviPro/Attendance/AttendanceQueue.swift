import Foundation
import Observation
import FivviAPI
import OpenAPIRuntime

typealias Attendance = Components.Schemas.Attendance

/// A participant's status as the screens show it; the API names it in three payloads, this joins them.
enum AttendanceStatus: String, Codable, Equatable, Sendable {
    case booked, attended, noShow = "no_show", cancelled

    init(_ payload: Components.Schemas.AttendanceParticipant.StatusPayload) {
        self = AttendanceStatus(rawValue: payload.rawValue) ?? .booked
    }

    /// What `PUT …/attendance` takes: never `cancelled`, which only cancelling a place sets.
    var request: Components.Schemas.SetAttendanceRequest.StatusPayload? {
        switch self {
        case .booked: .booked
        case .attended: .attended
        case .noShow: .noShow
        case .cancelled: nil
        }
    }
}

/// A request waiting in the offline queue: a tap or *Iedereen aanwezig*, with its client request ID.
struct AttendanceQueueEntry: Codable, Equatable, Identifiable, Sendable {
    enum Action: Codable, Equatable, Sendable {
        case set(clientID: String, status: Components.Schemas.SetAttendanceRequest.StatusPayload)
        /// The participants that were still open when it was tapped: the rows it changes.
        case everyone(clientIDs: [String])
    }

    /// The client request ID.
    let id: String
    let workspaceID: String
    let sessionID: String
    let action: Action
    /// The sign-in the tap was made in (a digest of its token, never the token): a sign-in that ended with a rejected token
    /// leaves its taps on the phone, and only the same account may send them (#1618). Nil in a file an older app wrote.
    var signIn: String?
    /// The account that tapped: nil while `GET /api/v1/me` had not answered in that sign-in.
    var account: String?

    var clientIDs: [String] {
        switch action {
        case let .set(clientID, _): [clientID]
        case let .everyone(clientIDs): clientIDs
        }
    }
}

/// F025's offline queue: every attendance tap of the app is a request in a list on the phone, sent in order, with a
/// client request ID of its own (a request sent twice stores one change). The list survives app restarts (a file with
/// complete file protection, cleared at sign-out) and is sent when the phone is online. A tap the API refuses on its way
/// (the class was cancelled meanwhile) leaves the list with the reason, so the screens revert that row and word it.
/// *Iedereen aanwezig* is one request of its own, in order with the taps around it (owner, 9 November 2026).
///
/// What waits belongs to a sign-in and an account (#1618). The sign-out the person chose (after the warning) empties the
/// queue for good (`clear()`), and a send that is still running neither sends on nor writes anything back. A token the
/// API rejected ends the sign-in without that warning, so the taps stay on the phone: they are sent when the same account
/// signs in again (`learn(account:)`), never under another account. Taps of another account are dropped then; taps whose
/// account was never known are not sent either, and the rows they changed say so (`Reason.other`).
@MainActor
@Observable
final class AttendanceQueue {
    typealias Entry = AttendanceQueueEntry

    /// Why a request left the queue without being stored.
    enum Reason: Equatable, Sendable {
        case sessionCancelled
        case participantCancelled
        case tooEarly(opensAt: Date)
        case other
    }

    struct Rejection: Equatable, Identifiable, Sendable {
        let id: String
        let sessionID: String
        let clientIDs: [String]
        let reason: Reason
    }

    private enum Outcome {
        case sent(Attendance)
        case rejected(Reason)
        /// The API could not be reached, or failed: the request stays and is sent again.
        case retry
    }

    /// What waits for the sign-in that is open.
    private(set) var entries: [Entry]
    /// What an earlier sign-in left and no account has claimed yet: out of sight (not in the sign-out warning), never
    /// sent, kept in the file.
    private var held: [Entry]
    /// The last answer of the API to a request of each session since its screen read it: what the screens show under
    /// the requests still waiting.
    private(set) var answers: [String: Attendance] = [:]
    /// How many participants of each session the API's last answer left open, until Vandaag or *Hele studio* read their day
    /// again: what keeps a nudge away meanwhile.
    private(set) var settled: [String: Int] = [:]
    private(set) var rejections: [Rejection] = []
    /// The last attempt to send did not get through.
    private(set) var isStalled = false
    /// Counts every request that left the queue, sent or refused, so a screen can read again.
    private(set) var revision = 0
    private let api: any APIProtocol
    private let store: any PersonalStore
    private let isOnline: @MainActor () -> Bool
    private let makeID: @MainActor () -> String
    private let retryAfter: Duration?
    private let signIn: @MainActor () -> String?
    /// The sign-in this queue was made for; once the token is another one, or gone, the queue neither sends nor writes.
    private let ownSignIn: String?
    /// The account of this sign-in, once `GET /api/v1/me` answered.
    private var account: String?
    private var isClosed = false
    private var running: Task<Void, Never>?
    private var retry: Task<Void, Never>?

    private static let file = "attendance-queue.json"

    /// `retryAfter`: how long after a failed attempt the queue tries again by itself; nil leaves it to the next tap, the
    /// foreground and a change of the network. `signIn` names the sign-in that is open now (`SignInFingerprint`).
    init(
        api: any APIProtocol, store: any PersonalStore, isOnline: @escaping @MainActor () -> Bool = { true },
        makeID: @escaping @MainActor () -> String = { UUID().uuidString.lowercased() },
        retryAfter: Duration? = .seconds(5), signIn: @escaping @MainActor () -> String? = { "sign-in" }
    ) {
        self.api = api
        self.store = store
        self.isOnline = isOnline
        self.makeID = makeID
        self.retryAfter = retryAfter
        self.signIn = signIn
        let own = signIn()
        ownSignIn = own
        let kept = store.read(Self.file).flatMap { try? JSONDecoder().decode([Entry].self, from: $0) } ?? []
        // A file an older app wrote was emptied at every sign-out, so its taps are those of the sign-in that is open.
        entries = kept.filter { $0.signIn == nil || $0.signIn == own }.map { entry in
            var entry = entry
            entry.signIn = own
            return entry
        }
        held = kept.filter { $0.signIn != nil && $0.signIn != own }
    }

    private var isCurrent: Bool { !isClosed && ownSignIn != nil && signIn() == ownSignIn }

    // MARK: What the screens ask

    func pending(sessionID: String) -> [Entry] { entries.filter { $0.sessionID == sessionID } }

    func hasPending(sessionID: String) -> Bool { entries.contains { $0.sessionID == sessionID } }

    /// *Wacht op verbinding*: something is waiting and the phone is offline or the last attempt did not get through.
    var waitsForConnection: Bool { !entries.isEmpty && (isStalled || !isOnline()) }

    func rejections(sessionID: String) -> [Rejection] { rejections.filter { $0.sessionID == sessionID } }

    func dismissRejections(sessionID: String, clientIDs: [String]) {
        rejections.removeAll { $0.sessionID == sessionID && !Set($0.clientIDs).isDisjoint(with: clientIDs) }
    }

    func forgetAnswer(sessionID: String) { answers[sessionID] = nil }

    /// A day was read again: it has the answers now.
    func forgetSettled() { settled = [:] }

    // MARK: Queueing

    func enqueue(workspaceID: String, sessionID: String, _ action: Entry.Action) {
        let entry = Entry(
            id: makeID(), workspaceID: workspaceID, sessionID: sessionID, action: action, signIn: ownSignIn,
            account: account
        )
        dismissRejections(sessionID: sessionID, clientIDs: entry.clientIDs)
        entries.append(entry)
        save()
        Task { await flush() }
    }

    /// Sends the requests in order until one cannot be sent. One run at a time: a second call waits for the run that is
    /// going, which also sends what was queued meanwhile.
    func flush() async {
        if let running { return await running.value }
        let task = Task { await self.run() }
        running = task
        await task.value
    }

    private func run() async {
        defer { running = nil }
        retry?.cancel()
        while isCurrent {
            guard isOnline() else { return }
            if !held.isEmpty {
                // Taps of an earlier sign-in go first and only for their own account: ask whose phone this is now.
                guard await resolveHeld() else {
                    isStalled = true
                    scheduleRetry()
                    return
                }
                continue
            }
            guard let entry = entries.first else { return }
            let outcome = await send(entry)
            // The person signed out (or the token went) while the request was out: nothing is written, nothing goes on.
            guard isCurrent else { return }
            switch outcome {
            case let .sent(answer):
                answers[entry.sessionID] = answer
                settled[entry.sessionID] = answer.summary.open
                isStalled = false
                leave(entry)
            case let .rejected(reason):
                rejections.append(Rejection(
                    id: entry.id, sessionID: entry.sessionID, clientIDs: entry.clientIDs, reason: reason
                ))
                isStalled = false
                leave(entry)
            case .retry:
                isStalled = true
                scheduleRetry()
                return
            }
        }
    }

    private func resolveHeld() async -> Bool {
        guard let profile = try? await api.getMe().ok.body.json, isCurrent else { return false }
        learn(account: profile.id)
        return true
    }

    /// `GET /api/v1/me` named the account of this sign-in. Taps of this sign-in that had no account are its account's.
    /// What an earlier sign-in left goes on only for that same account (before this sign-in's taps, in order); another
    /// account's taps are dropped, and taps of an earlier sign-in whose account was never known are not sent: the rows
    /// they changed show the generic message instead of the taps vanishing.
    func learn(account id: String) {
        guard isCurrent else { return }
        account = id
        entries = entries.map { entry in
            var entry = entry
            entry.account = entry.account ?? id
            return entry
        }
        if !held.isEmpty {
            let ours = held.filter { $0.account == id }.map { entry -> Entry in
                var entry = entry
                entry.signIn = ownSignIn
                return entry
            }
            for entry in held where entry.account == nil {
                rejections.append(Rejection(
                    id: entry.id, sessionID: entry.sessionID, clientIDs: entry.clientIDs, reason: .other
                ))
            }
            held = []
            entries = ours + entries
            revision += 1
        }
        save()
        if !entries.isEmpty { Task { await flush() } }
    }

    /// The sign-out the person chose, after the warning: what waits is lost, in memory and on disk, and a send that is
    /// still running writes nothing back. A rejected token does not come here: its taps stay for the same account.
    func clear() {
        isClosed = true
        retry?.cancel()
        entries = []
        held = []
        answers = [:]
        settled = [:]
        rejections = []
        isStalled = false
        store.clear()
    }

    private func leave(_ entry: Entry) {
        entries.removeAll { $0.id == entry.id }
        save()
        revision += 1
    }

    private func save() {
        guard isCurrent else { return }
        if let data = try? JSONEncoder().encode(held + entries) { store.write(data, as: Self.file) }
    }

    private func scheduleRetry() {
        guard let retryAfter else { return }
        retry = Task { [weak self] in
            try? await Task.sleep(for: retryAfter)
            guard !Task.isCancelled else { return }
            await self?.flush()
        }
    }

    // MARK: Sending

    private func send(_ entry: Entry) async -> Outcome {
        do {
            switch entry.action {
            case let .set(clientID, status): return try await sendSet(entry, clientID: clientID, status: status)
            case .everyone: return try await sendEveryone(entry)
            }
        } catch {
            // An answer the app cannot read is a refusal, as a request the API does not list: resending it would not help,
            // and the requests behind it would never go. A lost connection or a cancelled task is sent again.
            return Self.isUnreadable(error) ? .rejected(.other) : .retry
        }
    }

    /// The API answered, but with a body the generated client could not read.
    private static func isUnreadable(_ error: any Error) -> Bool {
        let cause = (error as? ClientError)?.underlyingError ?? error
        return cause is DecodingError
    }

    /// Whether an answer the contract does not list is the request's fault (4xx: refused, not sent again) or the API's
    /// (anything else: sent again later).
    private static func outcome(forUndocumented status: Int) -> Outcome {
        (400..<500).contains(status) ? .rejected(.other) : .retry
    }

    private func sendSet(
        _ entry: Entry, clientID: String, status: Components.Schemas.SetAttendanceRequest.StatusPayload
    ) async throws -> Outcome {
        let path = Operations.SetParticipantAttendance.Input.Path(
            workspaceId: entry.workspaceID, sessionId: entry.sessionID, clientId: clientID
        )
        let body = Components.Schemas.SetAttendanceRequest(status: status, clientRequestId: entry.id, surface: .ios)
        switch try await api.setParticipantAttendance(path: path, body: .json(body)) {
        case let .ok(accepted): return .sent(try accepted.body.json)
        case let .conflict(refusal): return .rejected(Self.reason(try refusal.body.json))
        case let .unprocessableContent(early): return .rejected(.tooEarly(opensAt: try early.body.json.opensAt))
        case .forbidden, .notFound, .badRequest: return .rejected(.other)
        case let .undocumented(status, _): return Self.outcome(forUndocumented: status)
        case .unauthorized, .internalServerError: return .retry
        }
    }

    private func sendEveryone(_ entry: Entry) async throws -> Outcome {
        let path = Operations.MarkEveryoneAttended.Input.Path(
            workspaceId: entry.workspaceID, sessionId: entry.sessionID
        )
        let body = Components.Schemas.MarkEveryoneAttendedRequest(clientRequestId: entry.id, surface: .ios)
        switch try await api.markEveryoneAttended(path: path, body: .json(body)) {
        case let .ok(accepted): return .sent(try accepted.body.json)
        case let .conflict(refusal): return .rejected(Self.reason(try refusal.body.json))
        case let .unprocessableContent(early): return .rejected(.tooEarly(opensAt: try early.body.json.opensAt))
        case .forbidden, .notFound, .badRequest: return .rejected(.other)
        case let .undocumented(status, _): return Self.outcome(forUndocumented: status)
        case .unauthorized, .internalServerError: return .retry
        }
    }

    private static func reason(_ refusal: Components.Schemas.AttendanceRefusal) -> Reason {
        refusal.code == .participantCancelled ? .participantCancelled : .sessionCancelled
    }
}

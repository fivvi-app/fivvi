import Foundation
import Observation
import FivviAPI
import FivviStrings

/// The attendance of one session (F025), for TD-02 (a private session's client or clients) and CO-05 (a class date's
/// participants): read from `GET …/participants` through the generated client, with the requests still waiting in the
/// offline queue laid over it, so a row shows what the person tapped at once. The API decides who may take attendance and
/// from when (`canTakeAttendance`, `attendanceOpensAt`); this model words it and queues the taps.
@MainActor
@Observable
final class AttendanceModel {
    enum State: Equatable {
        case loading
        case loaded
        case failed
        /// The API refused the session (the team access is gone, or it is not in the workspace).
        case noPermission
    }

    /// A participant as the screen shows it: the status with the waiting requests applied.
    struct Row: Identifiable, Equatable {
        let clientID: String
        let name: String
        let status: AttendanceStatus
        /// A request of this row is still in the queue.
        let isPending: Bool
        /// The API refused the last request of this row: the row is back at its status, with this text.
        let message: String?

        var id: String { clientID }
    }

    private(set) var state = State.loading
    private(set) var attendance: Attendance?
    private(set) var catalog: Catalog
    let workspace: CurrentWorkspace
    let sessionID: String
    private let api: any APIProtocol
    private let queue: AttendanceQueue
    private let clock: () -> Date
    private let onForbidden: @MainActor () async -> Void

    init(
        api: any APIProtocol, workspace: CurrentWorkspace, sessionID: String, catalog: Catalog, queue: AttendanceQueue,
        now: @escaping () -> Date = Date.init, onForbidden: @escaping @MainActor () async -> Void = {}
    ) {
        self.api = api
        self.workspace = workspace
        self.sessionID = sessionID
        self.catalog = catalog
        self.queue = queue
        clock = now
        self.onForbidden = onForbidden
    }

    func use(_ catalog: Catalog) { self.catalog = catalog }

    // MARK: Reading

    func load() async {
        state = .loading
        await read()
    }

    /// Reads again and leaves what is on screen until the answer is there.
    func refresh() async {
        await read()
    }

    private func read() async {
        do {
            let input = Operations.ListSessionParticipants.Input(
                path: .init(workspaceId: workspace.id, sessionId: sessionID)
            )
            switch try await api.listSessionParticipants(input) {
            case let .ok(found):
                attendance = try found.body.json
                queue.forgetAnswer(sessionID: sessionID)
                state = .loaded
            case .forbidden:
                await onForbidden()
                state = .noPermission
            case .notFound:
                state = .noPermission
            default:
                failed()
            }
        } catch {
            if ClientRequestError(thrown: error) != .cancelled { failed() }
        }
    }

    private func failed() {
        if state != .loaded { state = .failed }
    }

    // MARK: What is shown

    /// The last answer of the queue's sends, else what this screen read.
    private var current: Attendance? { queue.answers[sessionID] ?? attendance }

    private var format: SessionFormat { SessionFormat(locale: catalog.formattingLocale, timeZone: workspace.timeZone) }

    var isClass: Bool { current?._type == .group }
    var isCancelled: Bool { current?.status == .cancelled }

    /// The window has not opened yet: the buttons are off.
    var isTooEarly: Bool { current.map { clock() < $0.attendanceOpensAt } ?? false }

    /// A tap is accepted: the caller may take attendance, the session takes place and the window is open.
    var canMark: Bool { (current?.canTakeAttendance ?? false) && !isCancelled && !isTooEarly }

    /// *Aanwezigheid kun je invullen vanaf 17:30.*
    var tooEarlyText: String? {
        guard isTooEarly, let opens = current?.attendanceOpensAt else { return nil }
        return catalog.string(.attendanceTooEarly, format.time(opens))
    }

    /// *Vanaf 08:30.*, under TD-02's control while it is off for being early.
    var fromText: String? {
        guard isTooEarly, !isCancelled, let opens = current?.attendanceOpensAt else { return nil }
        return catalog.string(.attendanceFrom, format.time(opens))
    }

    /// *Deze les is geannuleerd. Aanwezigheid is niet nodig.*, and the private variant.
    var cancelledText: String? {
        isCancelled ? catalog[isClass ? .attendanceCancelledClass : .attendanceCancelledSession] : nil
    }

    /// *Geannuleerd.*, under TD-02's control on a cancelled session.
    var cancelledNote: String? { isCancelled ? catalog[.attendanceCancelledNote] : nil }

    var waitingText: String { catalog[.attendanceWaiting] }

    /// The participants with the waiting requests applied, in the API's order.
    var rows: [Row] {
        guard let current else { return [] }
        var status = Dictionary(
            uniqueKeysWithValues: current.participants.map { ($0.clientId, AttendanceStatus($0.status)) }
        )
        var pending = Set<String>()
        for entry in queue.pending(sessionID: sessionID) {
            switch entry.action {
            case let .set(clientID, payload):
                guard let was = status[clientID], was != .cancelled else { continue }
                status[clientID] = AttendanceStatus(rawValue: payload.rawValue)
                pending.insert(clientID)
            case .everyone:
                for (clientID, was) in status where was == .booked {
                    status[clientID] = .attended
                    pending.insert(clientID)
                }
            }
        }
        let refused = queue.rejections(sessionID: sessionID)
        return current.participants.map { participant in
            Row(
                clientID: participant.clientId, name: participant.name,
                status: status[participant.clientId] ?? .booked, isPending: pending.contains(participant.clientId),
                message: refused.last { $0.clientIDs.contains(participant.clientId) }.map { message(for: $0.reason) }
            )
        }
    }

    /// How many requests of this session the API refused: a screen reads again when it grows.
    var refusals: Int { queue.rejections(sessionID: sessionID).count }

    private func message(for reason: AttendanceQueue.Reason) -> String {
        switch reason {
        case .sessionCancelled: catalog[isClass ? .attendanceCancelledClass : .attendanceCancelledSession]
        case .participantCancelled: catalog[.attendanceErrorParticipantCancelled]
        case let .tooEarly(opensAt): catalog.string(.attendanceTooEarly, format.time(opensAt))
        case .other: catalog[.attendanceErrorGeneric]
        }
    }

    /// The counts of the rows as the phone has them, requests still waiting included.
    var summary: Components.Schemas.AttendanceSummary {
        let rows = rows
        func count(_ status: AttendanceStatus) -> Int { rows.filter { $0.status == status }.count }
        return .init(
            attended: count(.attended), noShow: count(.noShow), open: count(.booked), cancelled: count(.cancelled)
        )
    }

    /// *5 aanwezig · 1 niet verschenen · 1 open*
    var summaryText: String {
        let summary = summary
        return catalog.string(
            .attendanceSummary, String(summary.attended), String(summary.noShow), String(summary.open)
        )
    }

    /// *Wacht op verbinding* is shown on the rows that wait: the phone is offline or sending does not get through.
    var rowsWaitForConnection: Bool { queue.waitsForConnection }

    /// *Iedereen aanwezig* is possible: a class date with a participant still open, in an open window.
    var canMarkEveryone: Bool { isClass && canMark && rows.contains { $0.status == .booked } }

    func statusText(_ status: AttendanceStatus) -> String {
        switch status {
        case .booked: catalog[.attendanceBooked]
        case .attended: catalog[.attendanceAttended]
        case .noShow: catalog[.attendanceNoShow]
        case .cancelled: catalog[.attendanceCancelledStatus]
        }
    }

    /// "Anna de Vries, aanwezig, wacht op verbinding": one row for VoiceOver.
    func spokenLabel(_ row: Row) -> String {
        let base = catalog.string(.attendanceRowLabel, row.name, statusText(row.status).lowercased())
        return row.isPending && rowsWaitForConnection ? "\(base), \(waitingText.lowercased())" : base
    }

    // MARK: Taps

    /// Sets a status: queued, so it is saved at once and sent when the phone is online.
    func set(_ status: AttendanceStatus, for clientID: String) {
        guard canMark, let payload = status.request, let row = rows.first(where: { $0.clientID == clientID }),
              row.status != .cancelled
        else { return }
        queue.enqueue(workspaceID: workspace.id, sessionID: sessionID, .set(clientID: clientID, status: payload))
    }

    /// The two buttons of a row: tapping the selected one again takes the tap back to *Geboekt*.
    func toggle(_ status: AttendanceStatus, for clientID: String) {
        guard let row = rows.first(where: { $0.clientID == clientID }) else { return }
        set(row.status == status ? .booked : status, for: clientID)
    }

    /// *Iedereen aanwezig*: one queued request; the rows still open show *Aanwezig* at once.
    func markEveryone() {
        guard canMarkEveryone else { return }
        let open = rows.filter { $0.status == .booked }.map(\.clientID)
        queue.enqueue(workspaceID: workspace.id, sessionID: sessionID, .everyone(clientIDs: open))
    }
}

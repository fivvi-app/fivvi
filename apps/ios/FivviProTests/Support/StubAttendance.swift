import Foundation
import FivviAPI

@testable import FivviPro

/// The attendance routes of the stub (F025): one session's participants as the API holds them, what the app asked, and
/// the refusals or the lost connection a test sets.
final class StubAttendance: @unchecked Sendable {
    enum Failure: Sendable {
        /// The connection is lost: nothing is stored and the app gets an error.
        case offline
        /// The next requests are refused as the API refuses them (nothing is stored).
        case sessionCancelled, participantCancelled, tooEarly(Date)
        /// An answer the contract does not list (a 4xx or a 5xx), and one whose body does not decode.
        case undocumented(Int), malformed
    }

    /// One request to `PUT …/attendance` or `POST …/participants/attended`.
    struct Request: Equatable, Sendable {
        let clientID: String?
        let status: String?
        let clientRequestID: String
        let surface: String?
    }

    typealias Participant = Components.Schemas.AttendanceParticipant

    private let lock = NSLock()
    private var participants: [Participant] = []
    private var type = Components.Schemas.Attendance._TypePayload.group
    private var status = Components.Schemas.Attendance.StatusPayload.scheduled
    private var opensAt = Date.distantPast
    private var canTake = true
    private var failure: Failure?
    private var seen: [Request] = []
    private var reads = 0
    private var storedIDs: Set<String> = []

    /// Every request, in order (a request the stub refused or cut off is in it too).
    var requests: [Request] { lock.withLock { seen } }
    var readCount: Int { lock.withLock { reads } }

    func serve(
        _ people: [AttendanceFixtures.Person],
        type: Components.Schemas.Attendance._TypePayload = .group,
        opensAt: Date = .distantPast, canTake: Bool = true, cancelled: Bool = false
    ) {
        lock.withLock {
            participants = people.map { Participant(clientId: $0.id, name: $0.name, status: $0.status) }
            self.type = type
            self.opensAt = opensAt
            self.canTake = canTake
            status = cancelled ? .cancelled : .scheduled
        }
    }

    /// Someone else changed the participant meanwhile.
    func change(_ clientID: String, to new: Participant.StatusPayload) {
        lock.withLock {
            if let index = participants.firstIndex(where: { $0.clientId == clientID }) {
                participants[index].status = new
            }
        }
    }

    func cancelSession() { lock.withLock { status = .cancelled } }

    func fail(_ failure: Failure?) { lock.withLock { self.failure = failure } }

    private func attendance() -> Attendance {
        let count = { (status: Participant.StatusPayload) in self.participants.filter { $0.status == status }.count }
        return Attendance(
            sessionId: "session", _type: type, status: status, attendanceOpensAt: opensAt, canTakeAttendance: canTake,
            participants: participants,
            summary: .init(
                attended: count(.attended), noShow: count(.noShow), open: count(.booked), cancelled: count(.cancelled)
            )
        )
    }

    /// What the next request is answered with instead of being stored (called with the lock held): nil to store it.
    private enum Answer {
        case conflict(Components.Schemas.AttendanceRefusal.CodePayload)
        case tooEarly(Date)
        case undocumented(Int)
    }

    private func refusal() throws -> Answer? {
        switch failure {
        case .offline: throw URLError(.notConnectedToInternet)
        case .malformed: throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "not JSON"))
        case let .undocumented(code): return .undocumented(code)
        case .sessionCancelled: return .conflict(.sessionCancelled)
        case .participantCancelled: return .conflict(.participantCancelled)
        case let .tooEarly(opens): return .tooEarly(opens)
        case nil: return status == .cancelled ? .conflict(.sessionCancelled) : nil
        }
    }

    func list(_ input: Operations.ListSessionParticipants.Input) throws -> Operations.ListSessionParticipants.Output {
        try lock.withLock {
            reads += 1
            if case .offline = failure { throw URLError(.notConnectedToInternet) }
            return .ok(.init(body: .json(attendance())))
        }
    }

    func set(_ input: Operations.SetParticipantAttendance.Input) throws -> Operations.SetParticipantAttendance.Output {
        guard case let .json(body) = input.body else { fatalError("JSON body") }
        return try lock.withLock {
            seen.append(Request(
                clientID: input.path.clientId, status: body.status.rawValue, clientRequestID: body.clientRequestId,
                surface: body.surface?.rawValue
            ))
            switch try refusal() {
            case let .conflict(code)?: return .conflict(.init(body: .json(.init(code: code))))
            case let .tooEarly(opens)?:
                return .unprocessableContent(.init(body: .json(.init(code: .attendanceTooEarly, opensAt: opens))))
            case let .undocumented(code)?: return .undocumented(statusCode: code, .init())
            case nil: break
            }
            if storedIDs.insert(body.clientRequestId).inserted,
               let index = participants.firstIndex(where: { $0.clientId == input.path.clientId }),
               let new = Participant.StatusPayload(rawValue: body.status.rawValue) {
                participants[index].status = new
            }
            return .ok(.init(body: .json(attendance())))
        }
    }

    func everyone(_ input: Operations.MarkEveryoneAttended.Input) throws -> Operations.MarkEveryoneAttended.Output {
        guard case let .json(body) = input.body else { fatalError("JSON body") }
        return try lock.withLock {
            seen.append(Request(
                clientID: nil, status: nil, clientRequestID: body.clientRequestId, surface: body.surface?.rawValue
            ))
            switch try refusal() {
            case let .conflict(code)?: return .conflict(.init(body: .json(.init(code: code))))
            case let .tooEarly(opens)?:
                return .unprocessableContent(.init(body: .json(.init(code: .attendanceTooEarly, opensAt: opens))))
            case let .undocumented(code)?: return .undocumented(statusCode: code, .init())
            case nil: break
            }
            if storedIDs.insert(body.clientRequestId).inserted {
                for index in participants.indices where participants[index].status == .booked {
                    participants[index].status = .attended
                }
            }
            return .ok(.init(body: .json(attendance())))
        }
    }
}

import Foundation
import FivviAPI

/// The session routes of the stub workspace (F020): the default location, the trainers and the team, the sessions
/// planned and moved, and what each route answers, behind a lock (`StubAPI` is an actor and calls it from its routes).
/// It keeps what a test depends on: a session starts at the local date and time in the workspace's time zone, a move
/// raises the version, and a move with a stale version answers `409` with the session as it is.
final class StubSessions: @unchecked Sendable {
    typealias Session = Components.Schemas.Session

    enum Route: Sendable {
        case location, trainers, team, plan, get, reschedule, upcoming
    }

    typealias Failure = StubSessionFailure

    /// One reschedule the app sent.
    struct Move: Sendable, Equatable {
        let sessionID: String
        let body: Components.Schemas.ReschedulePrivateSessionRequest
    }

    /// The signed-in person as the team lists them.
    static let myMemberID = "5b1c2d3e-0000-4000-8000-0000000000a1"
    static let otherMemberID = "5b1c2d3e-0000-4000-8000-0000000000a2"

    private let lock = NSLock()
    private var failures: [Route: Failure] = [:]
    private var stored: [Session] = []
    private var nextNumber = 1
    private var trainerList: [Components.Schemas.Trainer] = [
        .init(id: StubSessions.myMemberID, name: "Owner"), .init(id: StubSessions.otherMemberID, name: "Sarah Visser")
    ]
    private var memberList: [Components.Schemas.TeamMember] = [
        .init(id: StubSessions.myMemberID, name: "Owner", email: "owner@example.com", role: .owner),
        .init(id: StubSessions.otherMemberID, name: "Sarah Visser", email: "sarah@example.com", role: .trainer)
    ]
    private var place = Components.Schemas.Location(
        id: "6d1c2d3e-0000-4000-8000-0000000000b1", name: "John's Gym", _type: .organizationLocation,
        address: .init(
            postcode: "1234 AB", houseNumber: "12", houseNumberAddition: "A", street: "Kerkstraat", city: "Amsterdam"
        ),
        isDefault: true
    )
    private var plansSent: [Components.Schemas.PlanPrivateSessionRequest] = []
    private var movesSent: [Move] = []
    private var getsSent: [String] = []
    private var timeZoneName = "Europe/Amsterdam"

    var plans: [Components.Schemas.PlanPrivateSessionRequest] { lock.withLock { plansSent } }
    var moves: [Move] { lock.withLock { movesSent } }
    var gets: [String] { lock.withLock { getsSent } }
    var all: [Session] { lock.withLock { stored } }

    func fail(_ route: Route, with failure: Failure?) {
        lock.withLock { failures[route] = failure }
    }

    func setTrainers(_ trainers: [Components.Schemas.Trainer], members: [Components.Schemas.TeamMember]) {
        lock.withLock {
            trainerList = trainers
            memberList = members
        }
    }

    func setLocation(_ location: Components.Schemas.Location) {
        lock.withLock { place = location }
    }

    /// Puts a session in the workspace, as it would be there already; returns it.
    @discardableResult
    func seed(
        client: Components.Schemas.Client, start: Date, minutes: Int = 60,
        trainer: Components.Schemas.SessionTrainer? = nil, cancelled: Bool = false
    ) -> Session {
        lock.withLock {
            let session = make(client: client, start: start, minutes: minutes, trainer: trainer)
            var made = session
            if cancelled { made.status = .cancelled }
            stored.append(made)
            return made
        }
    }

    // MARK: Routes

    func location() throws -> Operations.ListLocations.Output {
        try lock.withLock {
            if let failure = failures[.location] { return try Self.output(failure) }
            return .ok(.init(body: .json([place])))
        }
    }

    func trainers() throws -> Operations.ListTrainers.Output {
        try lock.withLock {
            if let failure = failures[.trainers] { return try Self.output(failure) }
            return .ok(.init(body: .json(trainerList)))
        }
    }

    func team() throws -> Operations.ListTeamMembers.Output {
        try lock.withLock {
            if let failure = failures[.team] { return try Self.output(failure) }
            return .ok(.init(body: .json(memberList)))
        }
    }

    func plan(_ body: Components.Schemas.PlanPrivateSessionRequest, clients: StubClients) throws
        -> Operations.CreatePrivateSession.Output {
        try lock.withLock {
            plansSent.append(body)
            if let failure = failures[.plan] { return try Self.output(failure) }
            guard let client = clients.all.first(where: { $0.id == body.clientId }),
                  let start = Self.date(body.localDate, body.localStart, timeZoneName)
            else { return .notFound(.init(body: .json(.init(code: .notFound)))) }
            let trainerID = body.trainerId ?? Self.myMemberID
            let trainer = trainerList.first { $0.id == trainerID }
                .map { Components.Schemas.SessionTrainer(id: $0.id, name: $0.name) }
            let overlaps = conflicts(
                trainerID: trainerID, start: start,
                end: start.addingTimeInterval(TimeInterval(body.durationMinutes * 60)), excluding: nil
            )
            if !overlaps.isEmpty, body.allowConflicts != true {
                return .conflict(.init(body: .json(.init(code: .trainerConflict, conflicts: overlaps))))
            }
            let session = make(client: client, start: start, minutes: body.durationMinutes, trainer: trainer)
            stored.append(session)
            return .created(.init(body: .json(.init(
                session: session, past: start < Date(), repeatedStart: false, confirmationEmail: body.notify
            ))))
        }
    }

    func get(_ id: String) throws -> Operations.GetSession.Output {
        try lock.withLock {
            getsSent.append(id)
            if let failure = failures[.get] { return try Self.output(failure) }
            guard let session = stored.first(where: { $0.id == id }) else {
                return .notFound(.init(body: .json(.init(code: .notFound))))
            }
            return .ok(.init(body: .json(session)))
        }
    }

    func reschedule(_ id: String, _ body: Components.Schemas.ReschedulePrivateSessionRequest) throws
        -> Operations.ReschedulePrivateSession.Output {
        try lock.withLock {
            movesSent.append(.init(sessionID: id, body: body))
            guard let index = stored.firstIndex(where: { $0.id == id }) else {
                return .notFound(.init(body: .json(.init(code: .notFound))))
            }
            if let failure = failures[.reschedule] {
                if case let .conflict(cancelled, changedBy) = failure {
                    stored[index].version += 1
                    if cancelled { stored[index].status = .cancelled }
                    return .conflict(.init(body: .json(.init(
                        code: cancelled ? .sessionCancelled : .sessionChanged, session: try Self.refused(stored[index]),
                        changedBy: changedBy.map { .init(name: $0) }
                    ))))
                }
                if case .conflictWithoutSession = failure {
                    return .conflict(.init(body: .json(.init(code: .sessionChanged))))
                }
                return try Self.output(failure)
            }
            guard stored[index].version == body.version else {
                let current = try Self.refused(stored[index])
                return .conflict(.init(body: .json(.init(code: .sessionChanged, session: current))))
            }
            guard let start = Self.date(body.localDate, body.localStart, timeZoneName) else {
                return .badRequest(.init(body: .json(.init(
                    code: .validationFailed, issues: [.init(path: "localDate", code: "invalid")]
                ))))
            }
            let end = start.addingTimeInterval(TimeInterval(body.durationMinutes * 60))
            let overlaps = stored[index].trainer.map {
                conflicts(trainerID: $0.id, start: start, end: end, excluding: id)
            } ?? []
            if !overlaps.isEmpty, body.allowConflicts != true {
                return .conflict(.init(body: .json(.init(code: .trainerConflict, conflicts: overlaps))))
            }
            stored[index].startsAt = start
            stored[index].endsAt = end
            stored[index].version += 1
            return .ok(.init(body: .json(.init(
                session: stored[index], past: start < Date(), repeatedStart: false, changeEmail: body.notify
            ))))
        }
    }

    func upcoming(_ clientID: String) throws -> Operations.ListClientUpcomingSessions.Output {
        try lock.withLock {
            if let failure = failures[.upcoming] { return try Self.output(failure) }
            let coming = stored
                .filter { $0.status == .scheduled && $0.startsAt > Date() }
                .filter { $0.participants.contains { $0.clientId == clientID } }
                .sorted { $0.startsAt < $1.startsAt }
                .prefix(5)
                .map {
                    Components.Schemas.UpcomingSession(
                        id: $0.id, startsAt: $0.startsAt, endsAt: $0.endsAt, trainer: $0.trainer
                    )
                }
            return .ok(.init(body: .json(.init(clientId: clientID, timeZone: timeZoneName, sessions: Array(coming)))))
        }
    }

    // MARK: Helpers

    /// The API's rule (F023 AC7), for the stub's own sessions: the trainer's scheduled sessions that overlap
    /// `[start, end)`, soonest first; back-to-back and cancelled sessions never do.
    func overlaps(trainerID: String, start: Date, end: Date) -> [Components.Schemas.TrainerConflictItem] {
        lock.withLock { conflicts(trainerID: trainerID, start: start, end: end, excluding: nil) }
    }

    /// Puts a class date in the workspace, as `POST …/group-classes` does with a first date; returns it.
    func addGroupDate(
        of groupClass: Components.Schemas.GroupClass, start: Date, minutes: Int, capacity: Int,
        trainer: Components.Schemas.SessionTrainer?
    ) -> Session {
        lock.withLock {
            defer { nextNumber += 1 }
            let made = Session(
                id: String(format: "8a0b1c2e-8a54-4b51-9a42-%012d", nextNumber), _type: .group, status: .scheduled,
                startsAt: start, endsAt: start.addingTimeInterval(TimeInterval(minutes * 60)), timeZone: timeZoneName,
                capacity: capacity, version: 1, location: place, trainer: trainer,
                groupClass: .init(id: groupClass.id, nameNl: groupClass.nameNl, nameEn: groupClass.nameEn),
                participants: []
            )
            stored.append(made)
            return made
        }
    }

    /// The local date and time of a request in the workspace's time zone.
    func instant(_ day: String, _ time: String) -> Date? { Self.date(day, time, timeZoneName) }

    /// The workspace's default location and the trainers the person may choose among.
    var trainerPeople: [Components.Schemas.Trainer] { lock.withLock { trainerList } }

    private func conflicts(
        trainerID: String, start: Date, end: Date, excluding id: String?
    ) -> [Components.Schemas.TrainerConflictItem] {
        stored
            .filter { $0.status == .scheduled && $0.id != id && $0.trainer?.id == trainerID }
            .filter { $0.startsAt < end && start < $0.endsAt }
            .sorted { $0.startsAt < $1.startsAt }
            .map {
                .init(
                    sessionId: $0.id, _type: $0._type == .group ? .group : ._private, startsAt: $0.startsAt,
                    endsAt: $0.endsAt, displayName: $0.groupClass?.nameNl ?? $0.participants.first?.name ?? "",
                    displayNameEn: $0.groupClass?.nameEn
                )
            }
    }

    private func make(
        client: Components.Schemas.Client, start: Date, minutes: Int, trainer: Components.Schemas.SessionTrainer?
    ) -> Session {
        defer { nextNumber += 1 }
        return .init(
            id: String(format: "8a0b1c2e-8a54-4b51-9a42-%012d", nextNumber), _type: ._private, status: .scheduled,
            startsAt: start, endsAt: start.addingTimeInterval(TimeInterval(minutes * 60)), timeZone: timeZoneName,
            capacity: 1, version: 1, location: place, trainer: trainer,
            participants: [.init(clientId: client.id, name: client.name, attendanceStatus: .booked)]
        )
    }

    /// The session as a `409` carries it: the generated `allOf` of the session and its description.
    private static func refused(
        _ session: Components.Schemas.Session
    ) throws -> Components.Schemas.ReschedulePrivateSessionRefusal.SessionPayload {
        .init(value1: session, value2: try .init(unvalidatedValue: nil))
    }

    /// The instant of a local date and time in a time zone.
    static func date(_ day: String, _ time: String, _ zone: String) -> Date? {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: zone)
        formatter.dateFormat = "yyyy-MM-dd HH:mm"
        return formatter.date(from: "\(day) \(time)")
    }

    /// The failure as the output of a route; `offline` throws. Generic over the route's output.
    static func output<Output: StubSessionsOutput>(_ failure: Failure) throws -> Output {
        switch failure {
        case .offline: throw URLError(.notConnectedToInternet)
        case let .status(code): return Output.undocumented(code)
        case .forbidden: return Output.forbidden()
        case .notFound: return Output.notFound()
        case let .badRequest(path, code): return Output.badRequest(path, code)
        case .conflict, .conflictWithoutSession: return Output.undocumented(409)
        }
    }
}

/// What a route answers instead of working.
enum StubSessionFailure: Sendable, Equatable {
    case offline
    case status(Int)
    case forbidden
    case notFound
    /// `400` naming one field, as the API refuses a date or a start.
    case badRequest(path: String, code: String)
    /// `409` for a move: `session_changed` by this person, or `session_cancelled`.
    case conflict(cancelled: Bool, changedBy: String?)
    /// `409` `session_changed` that carries no session.
    case conflictWithoutSession
}

/// The failure outputs every session route has, so `StubSessions.output` is written once.
protocol StubSessionsOutput {
    static func undocumented(_ status: Int) -> Self
    static func forbidden() -> Self
    static func notFound() -> Self
    static func badRequest(_ path: String, _ code: String) -> Self
}

private func issues(_ path: String, _ code: String) -> Components.Schemas.ValidationError {
    .init(code: .validationFailed, issues: [.init(path: path, code: code)])
}

extension Operations.ListLocations.Output: StubSessionsOutput {
    static func undocumented(_ status: Int) -> Self { .undocumented(statusCode: status, .init()) }
    static func forbidden() -> Self { .forbidden(.init(body: .json(.init(code: .forbidden)))) }
    static func notFound() -> Self { .notFound(.init(body: .json(.init(code: .notFound)))) }
    static func badRequest(_ path: String, _ code: String) -> Self {
        .badRequest(.init(body: .json(issues(path, code))))
    }
}

extension Operations.ListTrainers.Output: StubSessionsOutput {
    static func undocumented(_ status: Int) -> Self { .undocumented(statusCode: status, .init()) }
    static func forbidden() -> Self { .forbidden(.init(body: .json(.init(code: .forbidden)))) }
    static func notFound() -> Self { .notFound(.init(body: .json(.init(code: .notFound)))) }
    static func badRequest(_ path: String, _ code: String) -> Self {
        .badRequest(.init(body: .json(issues(path, code))))
    }
}

extension Operations.ListTeamMembers.Output: StubSessionsOutput {
    static func undocumented(_ status: Int) -> Self { .undocumented(statusCode: status, .init()) }
    static func forbidden() -> Self { .forbidden(.init(body: .json(.init(code: .forbidden)))) }
    static func notFound() -> Self { .notFound(.init(body: .json(.init(code: .notFound)))) }
    static func badRequest(_ path: String, _ code: String) -> Self {
        .badRequest(.init(body: .json(issues(path, code))))
    }
}

extension Operations.CreatePrivateSession.Output: StubSessionsOutput {
    static func undocumented(_ status: Int) -> Self { .undocumented(statusCode: status, .init()) }
    static func forbidden() -> Self { .forbidden(.init(body: .json(.init(code: .forbidden)))) }
    static func notFound() -> Self { .notFound(.init(body: .json(.init(code: .notFound)))) }
    static func badRequest(_ path: String, _ code: String) -> Self {
        .badRequest(.init(body: .json(issues(path, code))))
    }
}

extension Operations.GetSession.Output: StubSessionsOutput {
    static func undocumented(_ status: Int) -> Self { .undocumented(statusCode: status, .init()) }
    static func forbidden() -> Self { .forbidden(.init(body: .json(.init(code: .forbidden)))) }
    static func notFound() -> Self { .notFound(.init(body: .json(.init(code: .notFound)))) }
    static func badRequest(_ path: String, _ code: String) -> Self {
        .badRequest(.init(body: .json(issues(path, code))))
    }
}

extension Operations.ReschedulePrivateSession.Output: StubSessionsOutput {
    static func undocumented(_ status: Int) -> Self { .undocumented(statusCode: status, .init()) }
    static func forbidden() -> Self { .forbidden(.init(body: .json(.init(code: .forbidden)))) }
    static func notFound() -> Self { .notFound(.init(body: .json(.init(code: .notFound)))) }
    static func badRequest(_ path: String, _ code: String) -> Self {
        .badRequest(.init(body: .json(issues(path, code))))
    }
}

extension Operations.ListClientUpcomingSessions.Output: StubSessionsOutput {
    static func undocumented(_ status: Int) -> Self { .undocumented(statusCode: status, .init()) }
    static func forbidden() -> Self { .forbidden(.init(body: .json(.init(code: .forbidden)))) }
    static func notFound() -> Self { .notFound(.init(body: .json(.init(code: .notFound)))) }
    static func badRequest(_ path: String, _ code: String) -> Self {
        .badRequest(.init(body: .json(issues(path, code))))
    }
}

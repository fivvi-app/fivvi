import Foundation
import FivviAPI

/// The cancel routes of the stub workspace (F026): `POST …/sessions/{id}/cancel` for a private session,
/// `POST …/sessions/{id}/cancel-class` for a class date and `GET …/sessions/{id}/cancel-preview`. A stale version
/// answers `409` `session_changed` and a cancelled session `409` `session_cancelled`, both with the session as it is; a
/// cancellation stores the time, the signed-in person and who it came from, and raises the version.
extension StubSessions {
    /// One private-session cancellation the app sent.
    struct Cancel: Sendable, Equatable {
        let sessionID: String
        let body: Components.Schemas.CancelPrivateSessionRequest
    }

    /// One class-date cancellation the app sent.
    struct ClassCancel: Sendable, Equatable {
        let sessionID: String
        let body: Components.Schemas.CancelClassDateRequest
    }

    var cancels: [Cancel] { lock.withLock { cancelsSent } }
    var classCancels: [ClassCancel] { lock.withLock { classCancelsSent } }
    var previews: [String] { lock.withLock { previewsSent } }

    /// `POST …/sessions/{id}/cancel`: a stale version answers `409` `session_changed`, a cancelled session `409`
    /// `session_cancelled`, both with the session as it is; a cancellation stores the time, who clicked and the initiator.
    func cancel(_ id: String, _ body: Components.Schemas.CancelPrivateSessionRequest) throws
        -> Operations.CancelPrivateSession.Output {
        try lock.withLock {
            cancelsSent.append(.init(sessionID: id, body: body))
            guard let index = stored.firstIndex(where: { $0.id == id }) else {
                return .notFound(.init(body: .json(.init(code: .notFound))))
            }
            if let failure = failures[.cancel] {
                if case let .conflict(cancelled, changedBy) = failure {
                    stored[index].version += 1
                    if cancelled { stored[index].status = .cancelled }
                    return .conflict(.init(body: .json(.init(
                        code: cancelled ? .sessionCancelled : .sessionChanged,
                        session: .init(value1: stored[index], value2: try .init(unvalidatedValue: nil)),
                        changedBy: changedBy.map { .init(name: $0) }
                    ))))
                }
                return try Self.output(failure)
            }
            let current = stored[index]
            if current.status == .cancelled || current.version != body.version {
                return .conflict(.init(body: .json(.init(
                    code: current.status == .cancelled ? .sessionCancelled : .sessionChanged,
                    session: .init(value1: current, value2: try .init(unvalidatedValue: nil))
                ))))
            }
            stored[index].status = .cancelled
            stored[index].version += 1
            stored[index].cancellation = try record(initiator: body.initiator == .client ? .client : .workspace)
            let notified = body.notify && current.startsAt > Date() ? current.participants.count : 0
            return .ok(.init(body: .json(.init(session: stored[index], clientsNotified: notified))))
        }
    }

    /// `GET …/sessions/{id}/cancel-preview`: the people who would get the email and whether the date has started.
    func preview(_ id: String) throws -> Operations.PreviewClassCancellation.Output {
        try lock.withLock {
            previewsSent.append(id)
            if let failure = failures[.preview] { return try Self.output(failure) }
            guard let session = stored.first(where: { $0.id == id }) else {
                return .notFound(.init(body: .json(.init(code: .notFound))))
            }
            let started = session.startsAt <= Date()
            let people = started ? 0 : session.participants.filter { $0.attendanceStatus != .cancelled }.count
            return .ok(.init(body: .json(.init(
                sessionId: id, started: started, inSeries: session.series != nil,
                thisDate: .init(
                    datesCancelled: 1, datesRemoved: 0, datesWithEmails: people == 0 ? 0 : 1, participants: people,
                    emails: people
                )
            ))))
        }
    }

    /// `POST …/sessions/{id}/cancel-class`, like `cancel` for a class date.
    func cancelClass(_ id: String, _ body: Components.Schemas.CancelClassDateRequest) throws
        -> Operations.CancelClassDate.Output {
        try lock.withLock {
            classCancelsSent.append(.init(sessionID: id, body: body))
            guard let index = stored.firstIndex(where: { $0.id == id }) else {
                return .notFound(.init(body: .json(.init(code: .notFound))))
            }
            if let failure = failures[.cancelClass] {
                if case let .conflict(cancelled, changedBy) = failure {
                    stored[index].version += 1
                    if cancelled { stored[index].status = .cancelled }
                    return .conflict(.init(body: .json(.init(
                        code: cancelled ? .sessionCancelled : .sessionChanged,
                        session: .init(value1: stored[index], value2: try .init(unvalidatedValue: nil)),
                        changedBy: changedBy.map { .init(name: $0) }
                    ))))
                }
                return try Self.output(failure)
            }
            let current = stored[index]
            if current.status == .cancelled || current.version != body.version {
                return .conflict(.init(body: .json(.init(
                    code: current.status == .cancelled ? .sessionCancelled : .sessionChanged,
                    session: .init(value1: current, value2: try .init(unvalidatedValue: nil))
                ))))
            }
            stored[index].status = .cancelled
            stored[index].version += 1
            stored[index].cancellation = try record(initiator: .workspace)
            let notified = current.startsAt > Date() ? current.participants.count : 0
            return .ok(.init(body: .json(.init(
                session: .init(value1: stored[index], value2: try .init(unvalidatedValue: nil)), datesCancelled: 1,
                datesRemoved: 0, participantsNotified: notified
            ))))
        }
    }

    /// The record a cancellation leaves: now, the signed-in person and who it came from.
    private func record(initiator: Components.Schemas.SessionCancellation.InitiatorPayload) throws
        -> Components.Schemas.SessionCancellation {
        let name = trainerList.first { $0.id == Self.myMemberID }?.name ?? "Owner"
        return .init(
            cancelledAt: Date(),
            cancelledBy: .init(
                value1: .init(id: Self.myMemberID, name: name), value2: try .init(unvalidatedValue: nil)
            ),
            initiator: initiator
        )
    }
}

private func issues(_ path: String, _ code: String) -> Components.Schemas.ValidationError {
    .init(code: .validationFailed, issues: [.init(path: path, code: code)])
}

extension Operations.CancelPrivateSession.Output: StubSessionsOutput {
    static func undocumented(_ status: Int) -> Self { .undocumented(statusCode: status, .init()) }
    static func forbidden() -> Self { .forbidden(.init(body: .json(.init(code: .forbidden)))) }
    static func notFound() -> Self { .notFound(.init(body: .json(.init(code: .notFound)))) }
    static func badRequest(_ path: String, _ code: String) -> Self {
        .badRequest(.init(body: .json(issues(path, code))))
    }
}

extension Operations.CancelClassDate.Output: StubSessionsOutput {
    static func undocumented(_ status: Int) -> Self { .undocumented(statusCode: status, .init()) }
    static func forbidden() -> Self { .forbidden(.init(body: .json(.init(code: .forbidden)))) }
    static func notFound() -> Self { .notFound(.init(body: .json(.init(code: .notFound)))) }
    static func badRequest(_ path: String, _ code: String) -> Self {
        .badRequest(.init(body: .json(issues(path, code))))
    }
}

extension Operations.PreviewClassCancellation.Output: StubSessionsOutput {
    static func undocumented(_ status: Int) -> Self { .undocumented(statusCode: status, .init()) }
    static func forbidden() -> Self { .forbidden(.init(body: .json(.init(code: .forbidden)))) }
    static func notFound() -> Self { .notFound(.init(body: .json(.init(code: .notFound)))) }
    static func badRequest(_ path: String, _ code: String) -> Self {
        .badRequest(.init(body: .json(issues(path, code))))
    }
}

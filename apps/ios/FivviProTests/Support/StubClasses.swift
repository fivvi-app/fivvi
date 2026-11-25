import Foundation
import FivviAPI

/// The group class routes of the stub workspace (F021): `POST …/group-classes` (with its first date, the apps' quick
/// create) and `GET …/group-classes/{id}`. It follows what the screens depend on: a refused text, capacity, length or
/// time answers `400` naming the field as the API does, a trainer who isn't in the workspace `404`, a first date over
/// the trainer's other scheduled session `409` `trainer_conflict` unless the request has `allowConflicts`, and nothing is
/// stored when a request is refused (class and date are stored together or not at all). A first date that repeats
/// weekly (F022) makes 12 dates, each with the series (`datesAdded` 12), unless `skipsStart(on:)` says the clocks skip
/// the start on one of them: then the answer is the API's `400` on `firstDate.localStart` with that date.
final class StubClasses: @unchecked Sendable {
    typealias GroupClass = Components.Schemas.GroupClass

    enum Route: Sendable {
        case create, get
    }

    private let lock = NSLock()
    private var failures: [Route: StubSessions.Failure] = [:]
    private var stored: [GroupClass] = []
    private var created: [Components.Schemas.CreateGroupClassRequest] = []
    private var nextNumber = 1
    private var skippedDate: String?

    /// Every `POST …/group-classes` body so far.
    var creates: [Components.Schemas.CreateGroupClassRequest] { lock.withLock { created } }
    var all: [GroupClass] { lock.withLock { stored } }

    /// A weekly class whose start the clocks skip on `localDate` (`YYYY-MM-DD`), one of its 12 dates; nil removes it.
    func skipsStart(on localDate: String?) {
        lock.withLock { skippedDate = localDate }
    }

    func fail(_ route: Route, with failure: StubSessions.Failure?) {
        lock.withLock { failures[route] = failure }
    }

    /// Puts a class in the workspace, as it would be there already; returns it.
    @discardableResult
    func seed(
        nameNl: String, nameEn: String? = nil, descriptionNl: String? = nil, descriptionEn: String? = nil,
        capacity: Int = 8, durationMinutes: Int = 60, trainer: Components.Schemas.SessionTrainer? = nil,
        level: Components.Schemas.ClassLevel? = nil
    ) -> GroupClass {
        lock.withLock {
            let made = make(
                .init(
                    nameNl: nameNl, nameEn: nameEn, descriptionNl: descriptionNl, descriptionEn: descriptionEn,
                    trainerId: trainer?.id, capacity: capacity, durationMinutes: durationMinutes,
                    level: level.flatMap { .init(rawValue: $0.rawValue) }
                ),
                trainer: trainer
            )
            stored.append(made)
            return made
        }
    }

    /// The class a request makes; a blank text is none.
    private func make(
        _ body: Components.Schemas.CreateGroupClassRequest, trainer: Components.Schemas.SessionTrainer?
    ) -> GroupClass {
        defer { nextNumber += 1 }
        return .init(
            id: String(format: "9c0b1c2e-8a54-4b51-9a42-%012d", nextNumber),
            nameNl: body.nameNl.trimmingCharacters(in: .whitespaces), nameEn: Self.text(body.nameEn),
            descriptionNl: Self.text(body.descriptionNl), descriptionEn: Self.text(body.descriptionEn),
            capacity: body.capacity, durationMinutes: body.durationMinutes,
            defaultTrainer: trainer.flatMap { try? .init(value1: $0, value2: .init(unvalidatedValue: nil)) },
            level: body.level.flatMap { Components.Schemas.ClassLevel(rawValue: $0.rawValue) }
        )
    }

    func create(_ body: Components.Schemas.CreateGroupClassRequest, sessions: StubSessions) throws
        -> Operations.CreateGroupClass.Output {
        try lock.withLock {
            created.append(body)
            if let failure = failures[.create] { return try StubSessions.output(failure) }
            if let issue = Self.refusal(of: body, sessions: sessions) {
                return .badRequest(.init(body: .json(.init(code: .validationFailed, issues: [issue]))))
            }
            let people = sessions.trainerPeople
            var trainer: Components.Schemas.SessionTrainer?
            if let id = body.trainerId {
                guard let person = people.first(where: { $0.id == id }) else {
                    return .notFound(.init(body: .json(.init(code: .notFound))))
                }
                trainer = .init(id: person.id, name: person.name)
            }
            if body.firstDate?._repeat == .weekly, let skippedDate {
                return .badRequest(.init(body: .json(.init(
                    code: .validationFailed,
                    issues: [.init(path: "firstDate.localStart", code: "time_does_not_exist", date: skippedDate)]
                ))))
            }
            let start = body.firstDate.flatMap { sessions.instant($0.localDate, $0.localStart) }
            let minutes = TimeInterval(body.durationMinutes * 60)
            if let start, let trainer {
                let overlaps = sessions.overlaps(
                    trainerID: trainer.id, start: start, end: start.addingTimeInterval(minutes)
                )
                if !overlaps.isEmpty, body.allowConflicts != true {
                    return .conflict(.init(body: .json(.init(code: .trainerConflict, conflicts: overlaps))))
                }
            }
            let made = make(body, trainer: trainer)
            stored.append(made)
            let weekly = body.firstDate?._repeat == .weekly
            let dates = start.map {
                sessions.addGroupDates(of: made, from: $0, weekly: weekly, body: body, trainer: trainer)
            } ?? []
            let first = try dates.first.map {
                Components.Schemas.CreatedGroupClass.FirstDatePayload(
                    value1: $0, value2: try .init(unvalidatedValue: nil)
                )
            }
            return .created(.init(body: .json(.init(
                groupClass: made, firstDate: first, datesAdded: weekly ? dates.count : nil
            ))))
        }
    }

    func get(_ id: String) throws -> Operations.GetGroupClass.Output {
        try lock.withLock {
            if let failure = failures[.get] { return try StubSessions.output(failure) }
            guard let found = stored.first(where: { $0.id == id }) else {
                return .notFound(.init(body: .json(.init(code: .notFound))))
            }
            return .ok(.init(body: .json(found)))
        }
    }

    /// A blank text means none.
    private static func text(_ value: String?) -> String? {
        guard let trimmed = value?.trimmingCharacters(in: .whitespaces), !trimmed.isEmpty else { return nil }
        return trimmed
    }

    /// The first thing the API refuses about the body, as one `issues` entry (path and code).
    private static func refusal(
        of body: Components.Schemas.CreateGroupClassRequest, sessions: StubSessions
    ) -> Components.Schemas.ValidationError.IssuesPayloadPayload? {
        let name = body.nameNl.trimmingCharacters(in: .whitespaces)
        if name.isEmpty { return .init(path: "nameNl", code: "too_small") }
        if name.count > 80 { return .init(path: "nameNl", code: "too_big") }
        if (body.nameEn?.count ?? 0) > 80 { return .init(path: "nameEn", code: "too_big") }
        if (body.descriptionNl?.count ?? 0) > 500 { return .init(path: "descriptionNl", code: "too_big") }
        if (body.descriptionEn?.count ?? 0) > 500 { return .init(path: "descriptionEn", code: "too_big") }
        if !(1...100).contains(body.capacity) { return .init(path: "capacity", code: "too_small") }
        if !(15...240).contains(body.durationMinutes) || body.durationMinutes % 5 != 0 {
            return .init(path: "durationMinutes", code: "invalid")
        }
        if let first = body.firstDate, sessions.instant(first.localDate, first.localStart) == nil {
            return .init(path: "firstDate.localDate", code: "invalid_date")
        }
        return nil
    }
}

extension Operations.CreateGroupClass.Output: StubSessionsOutput {
    static func undocumented(_ status: Int) -> Self { .undocumented(statusCode: status, .init()) }
    static func forbidden() -> Self { .forbidden(.init(body: .json(.init(code: .forbidden)))) }
    static func notFound() -> Self { .notFound(.init(body: .json(.init(code: .notFound)))) }
    static func badRequest(_ path: String, _ code: String) -> Self {
        .badRequest(.init(body: .json(.init(code: .validationFailed, issues: [.init(path: path, code: code)]))))
    }
}

extension Operations.GetGroupClass.Output: StubSessionsOutput {
    static func undocumented(_ status: Int) -> Self { .undocumented(statusCode: status, .init()) }
    static func forbidden() -> Self { .forbidden(.init(body: .json(.init(code: .forbidden)))) }
    static func notFound() -> Self { .notFound(.init(body: .json(.init(code: .notFound)))) }
    static func badRequest(_ path: String, _ code: String) -> Self {
        .badRequest(.init(body: .json(.init(code: .validationFailed, issues: [.init(path: path, code: code)]))))
    }
}

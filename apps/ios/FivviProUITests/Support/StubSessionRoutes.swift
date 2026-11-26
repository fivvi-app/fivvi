import Foundation

/// The session routes of the stub server (F020): the default location, the trainers and the team, `POST …/sessions/private`,
/// `GET …/sessions/{id}`, `POST …/sessions/{id}/reschedule` and `GET …/clients/{id}/upcoming-sessions`. The workspace
/// starts with one session, Anna's tomorrow at 09:00 with the signed-in person. It follows the API's rules the screens
/// depend on: a session starts at the local date and time in Europe/Amsterdam, a move with a stale version answers `409`
/// with the session as it is and who changed it, a start can be refused as a time the clocks skip (`refuseNextStart`),
/// and a plan or move that overlaps another scheduled session of the same trainer answers `409` `trainer_conflict`
/// (PS-07, F023) unless the request has `allowConflicts: true`; back-to-back sessions are no overlap. The group class
/// routes of F021 are here too (`StubSessionRoutes+Classes.swift`): `POST …/group-classes` with its first date and
/// `GET …/group-classes/{id}`, over a class date seeded without a trainer (*Trainer nodig*) with a long description in
/// Dutch and English.
final class StubSessionRoutes: @unchecked Sendable {
    static let seededSessionID = "8a0b1c2e-8a54-4b51-9a42-000000000001"
    static let annaID = "3f0b1c2e-8a54-4b51-9a42-000000000001"
    static let myMemberID = "5b1c2d3e-0000-4000-8000-0000000000a1"
    static let otherMemberID = "5b1c2d3e-0000-4000-8000-0000000000a2"
    static let otherTrainerName = "Tom Bakker"
    static let zone = "Europe/Amsterdam"

    let lock = NSLock()
    let signIn: StubServer.SignIn
    private let clients: StubClientRoutes
    var sessions: [[String: Any]] = []
    var classes: [[String: Any]] = []
    var createdClasses: [[String: String]] = []
    var nextNumber = 3
    var refusesStart = false
    private var planned: [[String: String]] = []
    private var moved: [[String: String]] = []
    var cancelled: [[String: String]] = []
    var classCancelled: [[String: String]] = []
    var bookingLinkBodies: [[String: String]] = []
    var bookingLinks: [String: [String: Any]] = [:]
    /// F025: every attendance request so far, when attendance opens for a session (an hour ago unless a test says), the client
    /// request IDs already stored (a request sent twice stores one change) and the sessions a test says have ended.
    var attendanceLog: [[String: String]] = []
    var attendanceOpens: [String: Date] = [:]
    var attendanceStored: Set<String> = []
    var endedSessions: Set<String> = []

    init(signIn: StubServer.SignIn, clients: StubClientRoutes) {
        self.signIn = signIn
        self.clients = clients
        let tomorrow = Calendar.gregorianAmsterdam.date(byAdding: .day, value: 1, to: Date()) ?? Date()
        let start = Calendar.gregorianAmsterdam.date(bySettingHour: 9, minute: 0, second: 0, of: tomorrow) ?? tomorrow
        sessions = [session(
            id: Self.seededSessionID, start: start, minutes: 60, client: (Self.annaID, "Anna de Vries"),
            trainer: (Self.myMemberID, myName)
        )]
        let evening = Calendar.gregorianAmsterdam.date(bySettingHour: 18, minute: 0, second: 0, of: tomorrow)
        seedClass(start: evening ?? tomorrow)
    }

    /// Every `POST …/sessions/private` body so far, each value as text.
    var plans: [[String: String]] { lock.withLock { planned } }
    /// Every reschedule body so far, with the session's ID as `sessionId`.
    var moves: [[String: String]] { lock.withLock { moved } }

    /// The next plan or move is refused as a start the clocks skip (`400` on `localStart`, `time_does_not_exist`).
    func refuseNextStart(_ refuse: Bool = true) {
        lock.withLock { refusesStart = refuse }
    }

    /// Someone else changed the session meanwhile: its version is one higher, so the next move answers `409`.
    func changeSessionBySomeoneElse() {
        lock.withLock {
            sessions = sessions.map { session in
                var next = session
                next["version"] = (session["version"] as? Int ?? 1) + 1
                return next
            }
        }
    }

    var myName: String { signIn.name ?? "Owner" }
    var isOwner: Bool { signIn.role == "owner" }

    static func iso() -> ISO8601DateFormatter {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }

    var location: [String: Any] {
        [
            "id": "6d1c2d3e-0000-4000-8000-0000000000b1", "name": signIn.workspaceName ?? "John's Gym",
            "type": "organization_location", "isDefault": true,
            "address": ["postcode": "1234 AB", "houseNumber": "12", "houseNumberAddition": NSNull(),
                        "street": "Kerkstraat", "city": "Amsterdam"]
        ]
    }

    var trainers: [[String: Any]] {
        let own: [String: Any] = ["id": Self.myMemberID, "name": myName]
        return signIn.hasTeam ? [own, ["id": Self.otherMemberID, "name": Self.otherTrainerName]] : [own]
    }

    private func session(
        id: String, start: Date, minutes: Int, client: (id: String, name: String), trainer: (id: String, name: String)
    ) -> [String: Any] {
        [
            "id": id, "type": "private", "status": "scheduled", "startsAt": Self.iso().string(from: start),
            "endsAt": Self.iso().string(from: start.addingTimeInterval(TimeInterval(minutes * 60))),
            "timeZone": Self.zone, "capacity": 1, "version": 1, "location": location,
            "trainer": ["id": trainer.id, "name": trainer.name],
            "participants": [["clientId": client.id, "name": client.name, "attendanceStatus": "booked"]]
        ]
    }

    /// A JSON value as text: `true` and `false` stay words (a number's text would be 1 and 0).
    static func text(_ value: Any) -> String {
        if let number = value as? NSNumber, CFGetTypeID(number) == CFBooleanGetTypeID() {
            return number.boolValue ? "true" : "false"
        }
        return "\(value)"
    }

    static func date(_ day: String, _ time: String) -> Date? {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: zone)
        formatter.dateFormat = "yyyy-MM-dd HH:mm"
        return formatter.date(from: "\(day) \(time)")
    }

    static func isSessionRoute(_ path: String) -> Bool {
        path.hasPrefix("/api/v1/workspaces/")
            && ["/locations", "/trainers", "/team-members", "/sessions", "/group-classes", "/booking-links"]
            .contains { path.contains($0) } || path.hasSuffix("/upcoming-sessions")
    }

    /// The answer to a session route as `(status, JSON)`, or nil when `path` is none.
    func respond(method: String, path: String, body: [String: Any]) -> (status: Int, json: [String: Any])? {
        let parts = path.split(separator: "/").map(String.init)
        guard parts.count >= 5, parts[2] == "workspaces" else { return nil }
        return lock.withLock {
            switch (method, parts[4], parts.count) {
            case ("GET", "locations", 5): (200, ["_": [location]])
            case ("GET", "trainers", 5): (200, ["_": trainers])
            case ("GET", "team-members", 5): team()
            case ("POST", "sessions", 6) where parts[5] == "private": plan(body, workspace: parts[3])
            case ("GET", "sessions", 6): find(parts[5]).map { (200, $0) } ?? (404, ["code": "not_found"])
            case ("POST", "sessions", 7) where parts[6] == "reschedule": reschedule(parts[5], body)
            case ("GET", "clients", 7) where parts[6] == "upcoming-sessions": upcoming(parts[5])
            default: respondToCancelRoute(method: method, parts: parts, body: body)
            }
        }
    }

    private func team() -> (Int, [String: Any]) {
        guard isOwner else { return (403, ["code": "forbidden"]) }
        return (200, ["_": [
            ["id": Self.myMemberID, "name": myName, "email": signIn.email, "role": "owner"],
            ["id": Self.otherMemberID, "name": Self.otherTrainerName, "email": "tom@example.com", "role": "trainer"]
        ]])
    }

    func find(_ id: String) -> [String: Any]? { sessions.first { $0["id"] as? String == id } }

    func skipped() -> (Int, [String: Any]) {
        refusesStart = false
        return (400, ["code": "validation_failed", "issues": [["path": "localStart", "code": "time_does_not_exist"]]])
    }

    private func plan(_ body: [String: Any], workspace: String) -> (Int, [String: Any]) {
        planned.append(body.mapValues(Self.text))
        if refusesStart { return skipped() }
        guard let clientID = body["clientId"] as? String,
              let name = clients.name(ofClient: clientID, inWorkspace: workspace),
              let start = Self.date(body["localDate"] as? String ?? "", body["localStart"] as? String ?? "")
        else { return (400, ["code": "validation_failed", "issues": [["path": "localDate", "code": "invalid"]]]) }
        let trainerID = body["trainerId"] as? String ?? Self.myMemberID
        let trainer = trainers.first { $0["id"] as? String == trainerID }
        guard let trainer else { return (404, ["code": "not_found"]) }
        let minutes = body["durationMinutes"] as? Int ?? 60
        let overlaps = conflicts(trainerID: trainerID, start: start, minutes: minutes, excluding: nil)
        if !overlaps.isEmpty, body["allowConflicts"] as? Bool != true {
            return (409, ["code": "trainer_conflict", "conflicts": overlaps])
        }
        let made = session(
            id: String(format: "8a0b1c2e-8a54-4b51-9a42-%012d", nextNumber), start: start,
            minutes: minutes, client: (clientID, name),
            trainer: (trainerID, trainer["name"] as? String ?? "")
        )
        nextNumber += 1
        sessions.append(made)
        return (201, ["session": made, "past": start < Date(), "repeatedStart": false,
                      "confirmationEmail": body["notify"] as? Bool == true])
    }

    private func reschedule(_ id: String, _ body: [String: Any]) -> (Int, [String: Any]) {
        moved.append(body.mapValues(Self.text).merging(["sessionId": id]) { $1 })
        guard let index = sessions.firstIndex(where: { $0["id"] as? String == id }) else {
            return (404, ["code": "not_found"])
        }
        let current = sessions[index]
        guard current["version"] as? Int == body["version"] as? Int else {
            return (409, ["code": "session_changed", "session": current, "changedBy": ["name": Self.otherTrainerName]])
        }
        if refusesStart { return skipped() }
        guard let start = Self.date(body["localDate"] as? String ?? "", body["localStart"] as? String ?? "") else {
            return (400, ["code": "validation_failed", "issues": [["path": "localDate", "code": "invalid"]]])
        }
        let minutes = body["durationMinutes"] as? Int ?? 60
        let trainerID = (current["trainer"] as? [String: Any])?["id"] as? String ?? ""
        let overlaps = conflicts(trainerID: trainerID, start: start, minutes: minutes, excluding: id)
        if !overlaps.isEmpty, body["allowConflicts"] as? Bool != true {
            return (409, ["code": "trainer_conflict", "conflicts": overlaps])
        }
        var next = current
        next["startsAt"] = Self.iso().string(from: start)
        next["endsAt"] = Self.iso().string(from: start.addingTimeInterval(TimeInterval(minutes * 60)))
        next["version"] = (current["version"] as? Int ?? 1) + 1
        sessions[index] = next
        return (200, ["session": next, "past": start < Date(), "repeatedStart": false,
                      "changeEmail": body["notify"] as? Bool == true])
    }

    /// The trainer's scheduled sessions that overlap `[start, start + minutes)`, soonest first, as the API lists them.
    func conflicts(trainerID: String, start: Date, minutes: Int, excluding id: String?) -> [[String: Any]] {
        let end = start.addingTimeInterval(TimeInterval(minutes * 60))
        return sessions
            .compactMap { session -> (start: Date, item: [String: Any])? in
                guard session["id"] as? String != id, session["status"] as? String == "scheduled",
                      (session["trainer"] as? [String: Any])?["id"] as? String == trainerID,
                      let from = Self.iso().date(from: session["startsAt"] as? String ?? ""),
                      let until = Self.iso().date(from: session["endsAt"] as? String ?? ""), from < end, start < until
                else { return nil }
                let name = (session["participants"] as? [[String: Any]])?.first?["name"] as? String ?? ""
                return (from, [
                    "sessionId": session["id"] as? String ?? "", "type": "private",
                    "startsAt": session["startsAt"] ?? "", "endsAt": session["endsAt"] ?? "",
                    "displayName": name, "displayNameEn": NSNull()
                ])
            }
            .sorted { $0.start < $1.start }
            .map(\.item)
    }

    private func upcoming(_ clientID: String) -> (Int, [String: Any]) {
        let coming = sessions
            .filter { ($0["participants"] as? [[String: Any]])?.first?["clientId"] as? String == clientID }
            .filter { Self.iso().date(from: $0["startsAt"] as? String ?? "").map { $0 > Date() } ?? false }
            .map { session in
                ["id", "startsAt", "endsAt", "trainer"].reduce(into: [String: Any]()) { $0[$1] = session[$1] }
            }
        return (200, ["clientId": clientID, "timeZone": Self.zone, "sessions": coming])
    }
}

extension Calendar {
    /// The Gregorian calendar in Europe/Amsterdam.
    static var gregorianAmsterdam: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Amsterdam") ?? .current
        return calendar
    }
}

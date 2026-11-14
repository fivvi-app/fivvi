import Foundation

/// The session routes of the stub server (F020): the default location, the trainers and the team, `POST …/sessions/private`,
/// `GET …/sessions/{id}`, `POST …/sessions/{id}/reschedule` and `GET …/clients/{id}/upcoming-sessions`. The workspace
/// starts with one session, Anna's tomorrow at 09:00 with the signed-in person. It follows the API's rules the screens
/// depend on: a session starts at the local date and time in Europe/Amsterdam, a move with a stale version answers `409`
/// with the session as it is and who changed it, and a start can be refused as a time the clocks skip (`refuseNextStart`).
final class StubSessionRoutes: @unchecked Sendable {
    static let seededSessionID = "8a0b1c2e-8a54-4b51-9a42-000000000001"
    static let annaID = "3f0b1c2e-8a54-4b51-9a42-000000000001"
    static let myMemberID = "5b1c2d3e-0000-4000-8000-0000000000a1"
    static let otherMemberID = "5b1c2d3e-0000-4000-8000-0000000000a2"
    static let otherTrainerName = "Tom Bakker"
    static let zone = "Europe/Amsterdam"

    private let lock = NSLock()
    private let signIn: StubServer.SignIn
    private let clients: StubClientRoutes
    private var sessions: [[String: Any]] = []
    private var nextNumber = 2
    private var refusesStart = false
    private var planned: [[String: String]] = []
    private var moved: [[String: String]] = []

    init(signIn: StubServer.SignIn, clients: StubClientRoutes) {
        self.signIn = signIn
        self.clients = clients
        let tomorrow = Calendar.gregorianAmsterdam.date(byAdding: .day, value: 1, to: Date()) ?? Date()
        let start = Calendar.gregorianAmsterdam.date(bySettingHour: 9, minute: 0, second: 0, of: tomorrow) ?? tomorrow
        sessions = [session(
            id: Self.seededSessionID, start: start, minutes: 60, client: (Self.annaID, "Anna de Vries"),
            trainer: (Self.myMemberID, myName)
        )]
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

    private var myName: String { signIn.name ?? "Owner" }
    private var isOwner: Bool { signIn.role == "owner" }

    private static func iso() -> ISO8601DateFormatter {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }

    private var location: [String: Any] {
        [
            "id": "6d1c2d3e-0000-4000-8000-0000000000b1", "name": signIn.workspaceName ?? "John's Gym",
            "type": "organization_location", "isDefault": true,
            "address": ["postcode": "1234 AB", "houseNumber": "12", "houseNumberAddition": NSNull(),
                        "street": "Kerkstraat", "city": "Amsterdam"]
        ]
    }

    private var trainers: [[String: Any]] {
        [["id": Self.myMemberID, "name": myName], ["id": Self.otherMemberID, "name": Self.otherTrainerName]]
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
    private static func text(_ value: Any) -> String {
        if let number = value as? NSNumber, CFGetTypeID(number) == CFBooleanGetTypeID() {
            return number.boolValue ? "true" : "false"
        }
        return "\(value)"
    }

    private static func date(_ day: String, _ time: String) -> Date? {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: zone)
        formatter.dateFormat = "yyyy-MM-dd HH:mm"
        return formatter.date(from: "\(day) \(time)")
    }

    static func isSessionRoute(_ path: String) -> Bool {
        path.hasPrefix("/api/v1/workspaces/") && ["/locations", "/trainers", "/team-members", "/sessions"]
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
            default: nil
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

    private func find(_ id: String) -> [String: Any]? { sessions.first { $0["id"] as? String == id } }

    private func skipped() -> (Int, [String: Any]) {
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
        let made = session(
            id: String(format: "8a0b1c2e-8a54-4b51-9a42-%012d", nextNumber), start: start,
            minutes: body["durationMinutes"] as? Int ?? 60, client: (clientID, name),
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
        var next = current
        next["startsAt"] = Self.iso().string(from: start)
        let minutes = body["durationMinutes"] as? Int ?? 60
        next["endsAt"] = Self.iso().string(from: start.addingTimeInterval(TimeInterval(minutes * 60)))
        next["version"] = (current["version"] as? Int ?? 1) + 1
        sessions[index] = next
        return (200, ["session": next, "past": start < Date(), "repeatedStart": false,
                      "changeEmail": body["notify"] as? Bool == true])
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

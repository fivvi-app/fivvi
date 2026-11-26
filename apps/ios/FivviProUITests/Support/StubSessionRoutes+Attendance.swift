import Foundation

/// The attendance routes of the stub server (F025), over the participants of the sessions of `StubSessionRoutes`:
/// `GET …/sessions/{id}/participants`, `PUT …/participants/{clientId}/attendance` and `POST …/participants/attended`
/// (*Iedereen aanwezig*, class dates only). They follow the API's rules the screens depend on: before `attendanceOpensAt`
/// `422` `attendance_too_early` with the time, a cancelled session `409` `session_cancelled`, a participant who cancelled
/// `409` `participant_cancelled`, and a client request ID that was stored before answers the list and changes nothing. A
/// request is recorded when it arrives, refused or not, with its fields as text.
extension StubSessionRoutes {
    /// The names of the seven participants of "Kracht" in the spec (the seeded clients).
    static let krachtNames = [
        "Anna de Vries", "Bram Jansen", "Chris Bakker", "Dana Visser", "Eva Mulder", "Finn Smit", "Gijs de Boer"
    ]

    /// The client ID of the participant number `index` of the seeded class date.
    static func participantID(_ index: Int) -> String { "3f0b1c2e-8a54-4b51-9a42-00000000020\(index)" }

    /// Every attendance request so far in order: `kind` (`set` or `everyone`), `sessionId`, `clientId` and `status` of a
    /// `set`, `clientRequestId` and `surface`.
    var attendanceRequests: [[String: String]] { lock.withLock { attendanceLog } }

    /// Puts the seven participants of the spec on the seeded class date, all *Geboekt* except the ones named by first name
    /// in `statuses` (`no_show`, `attended`, `cancelled`).
    func seedKrachtParticipants(_ statuses: [String: String] = [:]) {
        lock.withLock {
            guard let index = sessions.firstIndex(where: { $0["id"] as? String == Self.seededClassDateID })
            else { return }
            sessions[index]["participants"] = Self.krachtNames.enumerated().map { number, name in
                let first = String(name.split(separator: " ")[0])
                return ["clientId": Self.participantID(number), "name": name,
                        "attendanceStatus": statuses[first] ?? "booked"]
            }
        }
    }

    /// From when attendance can be taken for a session (the API says 30 minutes before the start).
    func setAttendanceOpens(_ id: String, at date: Date) {
        lock.withLock { attendanceOpens[id] = date }
    }

    /// The session has ended: while a participant is *Geboekt* the personal and workspace days say it waits for
    /// attendance (`attendanceOpen`).
    func setEnded(_ id: String) {
        lock.withLock { _ = endedSessions.insert(id) }
    }

    /// The session is cancelled (by someone else, meanwhile).
    func cancelSession(_ id: String) {
        lock.withLock {
            guard let index = sessions.firstIndex(where: { $0["id"] as? String == id }) else { return }
            sessions[index]["status"] = "cancelled"
        }
    }

    /// Whether a test said the session has ended.
    func isEnded(_ id: String) -> Bool { lock.withLock { endedSessions.contains(id) } }

    /// Whether the session is ended and a participant is still *Geboekt*: `attendanceOpen` of the days.
    func attendanceOpen(_ id: String) -> Bool {
        lock.withLock {
            endedSessions.contains(id) && status(of: id) == "scheduled"
                && participants(of: id).contains { $0["attendanceStatus"] as? String == "booked" }
        }
    }

    private func status(of id: String) -> String? { find(id)?["status"] as? String }
    private func participants(of id: String) -> [[String: Any]] { find(id)?["participants"] as? [[String: Any]] ?? [] }

    private func attendance(_ id: String) -> [String: Any]? {
        guard let session = find(id) else { return nil }
        let people = participants(of: id)
        func count(_ status: String) -> Int { people.filter { $0["attendanceStatus"] as? String == status }.count }
        let opens = attendanceOpens[id] ?? Date().addingTimeInterval(-3600)
        return [
            "sessionId": id, "type": session["type"] ?? "private", "status": session["status"] ?? "scheduled",
            "attendanceOpensAt": Self.iso().string(from: opens), "canTakeAttendance": true,
            "participants": people.map { ["clientId": $0["clientId"] ?? "", "name": $0["name"] ?? "",
                                          "status": $0["attendanceStatus"] ?? "booked"] },
            "summary": ["attended": count("attended"), "noShow": count("no_show"), "open": count("booked"),
                        "cancelled": count("cancelled")]
        ]
    }

    func participantList(_ id: String) -> (Int, [String: Any]) {
        attendance(id).map { (200, $0) } ?? (404, ["code": "not_found"])
    }

    /// The refusal the API gives for the session and the participant, or nil when the change is accepted.
    private func refusal(_ id: String, clientID: String?) -> (Int, [String: Any])? {
        if status(of: id) == "cancelled" { return (409, ["code": "session_cancelled"]) }
        let opens = attendanceOpens[id] ?? Date().addingTimeInterval(-3600)
        if opens > Date() {
            return (422, ["code": "attendance_too_early", "opensAt": Self.iso().string(from: opens)])
        }
        if let clientID, participants(of: id).first(where: { $0["clientId"] as? String == clientID })?[
            "attendanceStatus"] as? String == "cancelled" {
            return (409, ["code": "participant_cancelled"])
        }
        return nil
    }

    func setAttendance(_ id: String, clientID: String, _ body: [String: Any]) -> (Int, [String: Any]) {
        let fields = ["kind": "set", "sessionId": id, "clientId": clientID]
        attendanceLog.append(body.mapValues(Self.text).merging(fields) { $1 })
        guard let index = sessions.firstIndex(where: { $0["id"] as? String == id }),
              var people = sessions[index]["participants"] as? [[String: Any]],
              let person = people.firstIndex(where: { $0["clientId"] as? String == clientID })
        else { return (404, ["code": "not_found"]) }
        if let refused = refusal(id, clientID: clientID) { return refused }
        if let requestID = body["clientRequestId"] as? String, attendanceStored.insert(requestID).inserted {
            people[person]["attendanceStatus"] = body["status"] as? String ?? "booked"
            sessions[index]["participants"] = people
        }
        return participantList(id)
    }

    func markEveryoneAttended(_ id: String, _ body: [String: Any]) -> (Int, [String: Any]) {
        attendanceLog.append(body.mapValues(Self.text).merging(["kind": "everyone", "sessionId": id]) { $1 })
        guard let index = sessions.firstIndex(where: { $0["id"] as? String == id }),
              var people = sessions[index]["participants"] as? [[String: Any]],
              sessions[index]["type"] as? String == "group"
        else { return (404, ["code": "not_found"]) }
        if let refused = refusal(id, clientID: nil) { return refused }
        if let requestID = body["clientRequestId"] as? String, attendanceStored.insert(requestID).inserted {
            for person in people.indices where people[person]["attendanceStatus"] as? String == "booked" {
                people[person]["attendanceStatus"] = "attended"
            }
            sessions[index]["participants"] = people
        }
        return participantList(id)
    }
}

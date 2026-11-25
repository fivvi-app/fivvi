import Foundation

/// The cancel routes of the stub server (F026), over the sessions of `StubSessionRoutes`: `POST …/sessions/{id}/cancel`
/// (a private session), `POST …/sessions/{id}/cancel-class` (a class date) and `GET …/sessions/{id}/cancel-preview`.
/// A cancellation stores the time, the signed-in person and who it came from and raises the version; a stale version
/// answers `409` `session_changed`, a cancelled session `409` `session_cancelled`, both with the session as it is.
extension StubSessionRoutes {
    /// The ID and name of the people a test books on the seeded class date (`bookOnSeededClassDate`).
    static let bookedNames = ["Anna de Vries", "Mark Jansen", "Lisa Smit"]

    /// `POST …/cancel`, `POST …/cancel-class` and `GET …/cancel-preview`; any other route is a class route.
    func respondToCancelRoute(method: String, parts: [String], body: [String: Any]) -> (Int, [String: Any])? {
        switch (method, parts[4], parts.count) {
        case ("POST", "sessions", 7) where parts[6] == "cancel": cancel(parts[5], body)
        case ("POST", "sessions", 7) where parts[6] == "cancel-class": cancelClass(parts[5], body)
        case ("GET", "sessions", 7) where parts[6] == "cancel-preview": cancelPreview(parts[5])
        case ("POST", "booking-links", 5): createBookingLink(body)
        default: respondToClassRoute(method: method, parts: parts, body: body)
        }
    }

    /// Every `POST …/cancel` body so far, each value as text, with the session's ID as `sessionId`.
    var cancels: [[String: String]] { lock.withLock { cancelled } }
    /// Every `POST …/cancel-class` body so far, each value as text, with the session's ID as `sessionId`.
    var classCancels: [[String: String]] { lock.withLock { classCancelled } }

    /// Books `count` people (at most 3) on the seeded class date, as F025's participants would be.
    func bookOnSeededClassDate(_ count: Int) {
        lock.withLock {
            guard let index = sessions.firstIndex(where: { $0["id"] as? String == Self.seededClassDateID })
            else { return }
            sessions[index]["participants"] = Self.bookedNames.prefix(count).enumerated().map { number, name in
                ["clientId": "3f0b1c2e-8a54-4b51-9a42-00000000010\(number)", "name": name, "attendanceStatus": "booked"]
            }
        }
    }

    /// Makes the seeded private session another trainer's, as a colleague's is.
    func giveSeededSessionToAnotherTrainer() {
        lock.withLock {
            guard let index = sessions.firstIndex(where: { $0["id"] as? String == Self.seededSessionID })
            else { return }
            sessions[index]["trainer"] = ["id": Self.otherMemberID, "name": Self.otherTrainerName]
        }
    }

    /// Whether the session with this ID is cancelled, for the personal routes that list it.
    func isCancelled(_ id: String) -> Bool {
        lock.withLock { find(id)?["status"] as? String == "cancelled" }
    }

    func cancel(_ id: String, _ body: [String: Any]) -> (Int, [String: Any]) {
        cancelled.append(body.mapValues(Self.text).merging(["sessionId": id]) { $1 })
        guard let stored = store(id, body, initiator: body["initiator"] as? String ?? "client") else {
            return (404, ["code": "not_found"])
        }
        if let refusal = stored.refusal { return refusal }
        let notified = body["notify"] as? Bool == true && !stored.started ? stored.people : 0
        return (200, ["session": stored.session, "clientsNotified": notified])
    }

    func cancelClass(_ id: String, _ body: [String: Any]) -> (Int, [String: Any]) {
        classCancelled.append(body.mapValues(Self.text).merging(["sessionId": id]) { $1 })
        guard isOwner else { return (403, ["code": "forbidden"]) }
        guard let stored = store(id, body, initiator: "workspace") else { return (404, ["code": "not_found"]) }
        if let refusal = stored.refusal { return refusal }
        return (200, [
            "session": stored.session, "datesCancelled": 1, "datesRemoved": 0,
            "participantsNotified": stored.started ? 0 : stored.people
        ])
    }

    func cancelPreview(_ id: String) -> (Int, [String: Any]) {
        guard isOwner else { return (403, ["code": "forbidden"]) }
        guard let current = find(id) else { return (404, ["code": "not_found"]) }
        if current["status"] as? String == "cancelled" { return (409, ["code": "session_cancelled"]) }
        let started = (Self.iso().date(from: current["startsAt"] as? String ?? "") ?? Date()) <= Date()
        let people = started ? 0 : ((current["participants"] as? [[String: Any]])?.count ?? 0)
        return (200, [
            "sessionId": id, "started": started, "inSeries": current["series"] != nil,
            "thisDate": ["datesCancelled": 1, "datesRemoved": 0, "datesWithEmails": people == 0 ? 0 : 1,
                         "participants": people, "emails": people]
        ])
    }

    /// What a cancellation left: the session, a refusal instead of it, and who would be emailed.
    struct Stored {
        let session: [String: Any]
        let refusal: (Int, [String: Any])?
        let started: Bool
        let people: Int
    }

    /// Cancels the session in the stub's list, unless the request is stale or the session is cancelled already.
    private func store(_ id: String, _ body: [String: Any], initiator: String) -> Stored? {
        guard let index = sessions.firstIndex(where: { $0["id"] as? String == id }) else { return nil }
        let current = sessions[index]
        let started = (Self.iso().date(from: current["startsAt"] as? String ?? "") ?? Date()) <= Date()
        let people = (current["participants"] as? [[String: Any]])?.count ?? 0
        if current["status"] as? String == "cancelled" || current["version"] as? Int != body["version"] as? Int {
            let code = current["status"] as? String == "cancelled" ? "session_cancelled" : "session_changed"
            return Stored(
                session: current, refusal: (409, ["code": code, "session": current]), started: started, people: people
            )
        }
        var next = current
        next["status"] = "cancelled"
        next["version"] = (current["version"] as? Int ?? 1) + 1
        next["cancellation"] = [
            "cancelledAt": Self.iso().string(from: Date()), "initiator": initiator,
            "cancelledBy": ["id": Self.myMemberID, "name": myName]
        ]
        sessions[index] = next
        return Stored(session: next, refusal: nil, started: started, people: people)
    }
}

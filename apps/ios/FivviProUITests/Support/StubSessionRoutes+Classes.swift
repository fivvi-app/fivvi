import Foundation

/// The group class routes of the stub server (F021), over the sessions of `StubSessionRoutes`: `POST …/group-classes`
/// (the apps' quick create, a class with its first date in one request) and `GET …/group-classes/{id}`. A refused text,
/// capacity or length answers `400` naming the field as the API does, a trainer who isn't in the workspace `404`, a first
/// date over the trainer's other scheduled session `409` `trainer_conflict` unless `allowConflicts` is `true`. A first
/// date with `repeat: weekly` (F022) makes 12 dates on the same weekday and wall-clock time, each with its series, and
/// answers `datesAdded: 12`; with `refuseNextStart` it is refused as the API refuses a weekly start the clocks skip on
/// one of its dates: `400` on `firstDate.localStart`, `time_does_not_exist`, with that date (`skippedDate`).
extension StubSessionRoutes {
    /// The class date every launch starts with: *Kracht* (English *Strength*), tomorrow at 18:00, no trainer.
    static let seededClassDateID = "8a0b1c2e-8a54-4b51-9a42-000000000002"
    static let seededClassID = "9c0b1c2e-8a54-4b51-9a42-000000000001"
    /// The date the stub names when a weekly class's start is skipped: Sunday 28 March 2027, 02:30 does not exist.
    static let skippedDate = "2027-03-28"
    /// The description of the seeded class, long enough to be cut to a few lines, in Dutch and in English.
    static let seededDescriptionNl = "Een uur kracht voor het hele lichaam, met halters, kettlebells en je eigen "
        + "lichaamsgewicht. We werken aan benen, rug, borst en schouders, en sluiten af met een rustige cooling-down "
        + "waarin je ook je mobiliteit traint. Geschikt voor beginners en gevorderden."
    static let seededDescriptionEn = "An hour of strength work for the whole body, with dumbbells, kettlebells and "
        + "your own body weight. We work on legs, back, chest and shoulders, and finish with a calm cool-down that "
        + "also trains your mobility. Suitable for beginners and advanced."

    func seedClass(start: Date) {
        let made: [String: Any] = [
            "id": Self.seededClassID, "nameNl": "Kracht", "nameEn": "Strength",
            "descriptionNl": Self.seededDescriptionNl, "descriptionEn": Self.seededDescriptionEn,
            "capacity": 8, "durationMinutes": 60
        ]
        classes = [made]
        sessions.append(groupSession(
            id: Self.seededClassDateID, groupClass: made, when: DateInterval(start: start, duration: 3600),
            capacity: 8, trainer: nil
        ))
    }

    /// Every `POST …/group-classes` body so far, each value as text; the first date's fields as `firstDate.localDate`
    /// and `firstDate.localStart`.
    var createdGroupClasses: [[String: String]] { lock.withLock { createdClasses } }

    /// `POST …/group-classes` and `GET …/group-classes/{id}`; nil for any other route.
    func respondToClassRoute(method: String, parts: [String], body: [String: Any]) -> (Int, [String: Any])? {
        switch (method, parts[4], parts.count) {
        case ("POST", "group-classes", 5): createClass(body)
        case ("GET", "group-classes", 6): findClass(parts[5]).map { (200, $0) } ?? (404, ["code": "not_found"])
        default: nil
        }
    }

    func findClass(_ id: String) -> [String: Any]? { classes.first { $0["id"] as? String == id } }

    private func groupSession(
        id: String, groupClass: [String: Any], when: DateInterval, capacity: Int, trainer: (id: String, name: String)?
    ) -> [String: Any] {
        var made: [String: Any] = [
            "id": id, "type": "group", "status": "scheduled", "startsAt": Self.iso().string(from: when.start),
            "endsAt": Self.iso().string(from: when.end),
            "timeZone": Self.zone, "capacity": capacity, "version": 1, "location": location,
            "groupClass": [
                "id": groupClass["id"] ?? "", "nameNl": groupClass["nameNl"] ?? "",
                "nameEn": groupClass["nameEn"] ?? NSNull()
            ],
            "participants": [[String: Any]]()
        ]
        if let trainer { made["trainer"] = ["id": trainer.id, "name": trainer.name] }
        if let level = groupClass["level"] { made["level"] = level }
        return made
    }

    private func refused(_ path: String, _ code: String) -> (Int, [String: Any]) {
        (400, ["code": "validation_failed", "issues": [["path": path, "code": code]]])
    }

    /// The first thing the API refuses about the body, or nil.
    private func refusal(of body: [String: Any]) -> (Int, [String: Any])? {
        let name = (body["nameNl"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let capacity = body["capacity"] as? Int ?? 0
        let minutes = body["durationMinutes"] as? Int ?? 0
        if name.isEmpty { return refused("nameNl", "too_small") }
        if name.count > 80 { return refused("nameNl", "too_big") }
        if !(1...100).contains(capacity) { return refused("capacity", "too_small") }
        if !(15...240).contains(minutes) || minutes % 5 != 0 { return refused("durationMinutes", "invalid") }
        if refusesStart { return skipped() }
        return nil
    }

    func createClass(_ body: [String: Any]) -> (Int, [String: Any]) {
        var flat = body.filter { $0.key != "firstDate" }.mapValues(Self.text)
        let first = body["firstDate"] as? [String: Any]
        flat["firstDate.localDate"] = first?["localDate"].map(Self.text)
        flat["firstDate.localStart"] = first?["localStart"].map(Self.text)
        flat["firstDate.repeat"] = first?["repeat"].map(Self.text)
        createdClasses.append(flat)
        let weekly = first?["repeat"] as? String == "weekly"
        if weekly, refusesStart {
            refusesStart = false
            return (400, ["code": "validation_failed", "issues": [[
                "path": "firstDate.localStart", "code": "time_does_not_exist", "date": Self.skippedDate
            ]]])
        }
        if let refusal = refusal(of: body) { return refusal }
        guard isOwner else { return (403, ["code": "forbidden"]) }
        let trainerID = body["trainerId"] as? String
        let trainer = trainerID.flatMap { id in trainers.first { $0["id"] as? String == id } }
        if trainerID != nil, trainer == nil { return (404, ["code": "not_found"]) }
        let day = first?["localDate"] as? String ?? ""
        guard let start = Self.date(day, first?["localStart"] as? String ?? "")
        else { return refused("firstDate.localDate", "invalid_date") }
        let minutes = body["durationMinutes"] as? Int ?? 60
        if let clash = clash(of: body, trainerID: trainerID, start: start, minutes: minutes) { return clash }
        let made = makeClass(from: body)
        classes.append(made)
        let dates = (0..<(weekly ? 12 : 1)).compactMap { week -> [String: Any]? in
            guard let when = Calendar.gregorianAmsterdam.date(byAdding: .weekOfYear, value: week, to: start) else {
                return nil
            }
            var date = groupSession(
                id: String(format: "8a0b1c2e-8a54-4b51-9a42-%012d", nextNumber), groupClass: made,
                when: DateInterval(start: when, duration: TimeInterval(minutes * 60)),
                capacity: body["capacity"] as? Int ?? 1,
                trainer: trainer.map { ($0["id"] as? String ?? "", $0["name"] as? String ?? "") }
            )
            if weekly { date["series"] = series(of: start, occurrence: when) }
            nextNumber += 1
            sessions.append(date)
            return date
        }
        var answer: [String: Any] = ["groupClass": made, "firstDate": dates.first ?? NSNull()]
        if weekly { answer["datesAdded"] = dates.count }
        return (201, answer)
    }

    /// The weekly series of a date: its weekday and wall-clock start, as the API writes them.
    private func series(of start: Date, occurrence: Date) -> [String: Any] {
        let calendar = Calendar.gregorianAmsterdam
        let codes = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"]
        let parts = calendar.dateComponents([.hour, .minute], from: start)
        let day = DateFormatter()
        day.locale = Locale(identifier: "en_US_POSIX")
        day.timeZone = calendar.timeZone
        day.dateFormat = "yyyy-MM-dd"
        return [
            "id": "5e1c2d3e-0000-4000-8000-000000000001",
            "weekday": codes[calendar.component(.weekday, from: start) - 1],
            "localStartTime": String(format: "%02d:%02d", parts.hour ?? 0, parts.minute ?? 0),
            "occurrenceDate": day.string(from: occurrence), "changedFields": [String]()
        ]
    }

    /// `409` `trainer_conflict` when the trainer has something then and the request doesn't allow it.
    private func clash(
        of body: [String: Any], trainerID: String?, start: Date, minutes: Int
    ) -> (Int, [String: Any])? {
        guard let trainerID, body["allowConflicts"] as? Bool != true else { return nil }
        let overlaps = conflicts(trainerID: trainerID, start: start, minutes: minutes, excluding: nil)
        return overlaps.isEmpty ? nil : (409, ["code": "trainer_conflict", "conflicts": overlaps])
    }

    private func makeClass(from body: [String: Any]) -> [String: Any] {
        func text(_ key: String) -> Any {
            let value = (body[key] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            return value.isEmpty ? NSNull() : value
        }
        return [
            "id": String(format: "9c0b1c2e-8a54-4b51-9a42-%012d", classes.count + 1),
            "nameNl": (body["nameNl"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
            "nameEn": text("nameEn"), "descriptionNl": text("descriptionNl"), "descriptionEn": text("descriptionEn"),
            "capacity": body["capacity"] as? Int ?? 1, "durationMinutes": body["durationMinutes"] as? Int ?? 60
        ].merging(body["level"].map { ["level": $0] } ?? [:]) { $1 }
    }

    /// The seeded class and its date have this level (F067: `all_levels`, `beginner`, `intermediate` or `advanced`), or
    /// none for *Geen*.
    func setSeededLevel(_ level: String?) {
        lock.withLock {
            func apply(_ item: [String: Any]) -> [String: Any] {
                var next = item
                next["level"] = level
                if level == nil { next.removeValue(forKey: "level") }
                return next
            }
            classes = classes.map { $0["id"] as? String == Self.seededClassID ? apply($0) : $0 }
            sessions = sessions.map { $0["id"] as? String == Self.seededClassDateID ? apply($0) : $0 }
        }
    }
}

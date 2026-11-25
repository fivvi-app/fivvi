import Foundation

/// `GET /api/v1/me/day` of the stub server (F013): Tuesday 22 September 2026 as the spec has it, whatever the date
/// asked for is when it is that day (the app runs with `-UITestNow 2026-09-22T08:35`, so it is "08:35" there), and an
/// empty day for any other. The sessions are in John's Gym (workspace 0) and Sarah Personal Training (workspace 1) of
/// the stub account; the private one in Sarah Personal Training is the seeded session of `StubSessionRoutes`, so its
/// TD-02 opens, and the class is the seeded class date.
final class StubPersonalRoutes: @unchecked Sendable {
    /// What the stub answers: Sarah's four items in two workspaces, a private-only day in one, or nothing.
    enum Day: Sendable {
        case sarah, solo, empty
    }

    static let day = "2026-09-22"
    /// The IDs of the items, for a test that taps them.
    static let anna = StubSessionRoutes.seededSessionID
    static let mark = "8a0b1c2e-8a54-4b51-9a42-0000000000b2"
    static let kracht = StubSessionRoutes.seededClassDateID
    static let krachtCancelled = "8a0b1c2e-8a54-4b51-9a42-0000000000b4"

    private let lock = NSLock()
    private var served = Day.sarah
    /// Whether the session with this ID has been cancelled meanwhile (from TD-02), so the lists show it struck through.
    var isCancelled: @Sendable (String) -> Bool = { _ in false }

    var day: Day {
        get { lock.withLock { served } }
        set { lock.withLock { served = newValue } }
    }

    private static func instant(_ time: String, _ day: String = day) -> String {
        StubSessionRoutes.iso().string(from: StubSessionRoutes.date(day, time) ?? Date())
    }

    private static func workspace(_ index: Int, _ name: String) -> [String: Any] {
        ["id": Responder.workspaceID(index), "slug": "workspace-\(index)", "name": name]
    }

    /// What the API says each workspace runs (#1534): John's Gym runs classes, so Sarah's answers name the kind; a
    /// person on one workspace without classes never does.
    private static func sessionTypes(_ day: Day) -> [String: Any] {
        let gym: [String: Any] = workspace(0, "John's Gym").merging(["sessionTypes": ["private", "group"]]) { $1 }
        let own: [String: Any] = workspace(1, "Sarah Personal Training").merging(["sessionTypes": ["private"]]) { $1 }
        let alone: [String: Any] = workspace(0, "John's Gym").merging(["sessionTypes": ["private"]]) { $1 }
        return ["workspaces": day == .sarah ? [gym, own] : [alone], "showsKindLabel": day == .sarah]
    }

    private static func place(_ name: String) -> [String: Any] {
        [
            "id": "6d1c2d3e-0000-4000-8000-0000000000b1", "name": name, "type": "external_gym", "isDefault": false,
            "address": ["postcode": "1234 AB", "houseNumber": "12", "houseNumberAddition": NSNull(),
                        "street": "Kerkstraat", "city": "Amsterdam"]
        ]
    }

    private static func item(
        _ id: String, _ workspace: [String: Any], _ start: String, _ end: String, client: String? = nil,
        className: String? = nil, cancelled: Bool = false, place name: String? = nil, day: String = day
    ) -> [String: Any] {
        var item: [String: Any] = [
            "sessionId": id, "workspace": workspace, "type": className == nil ? "private" : "group",
            "status": cancelled ? "cancelled" : "scheduled", "startsAt": instant(start, day),
            "endsAt": instant(end, day),
            "timeZone": StubSessionRoutes.zone, "capacity": className == nil ? 1 : 8
        ]
        if className != nil { item["booked"] = 0 }
        if let className { item["className"] = className }
        if let client { item["clientName"] = client }
        if let name { item["location"] = place(name) }
        return item
    }

    func respond(date: String) -> (status: Int, json: [String: Any]) {
        let which = day
        guard date == Self.day, which != .empty else {
            return (200, [
                "date": date, "timeZone": StubSessionRoutes.zone, "workspaceCount": 1, "items": [Any](),
                "summary": ["count": 0, "done": 0], "hasSessions": true, "nextSessionDate": "2026-10-01"
            ].merging(Self.sessionTypes(which)) { $1 })
        }
        let johns = Self.workspace(0, "John's Gym")
        let sarah = Self.workspace(1, "Sarah Personal Training")
        let items = [
            Self.item(Self.anna, sarah, "09:00", "10:00", client: "Anna de Vries", place: "TrainMore Zuid"),
            Self.item(Self.mark, johns, "11:00", "12:00", client: "Mark Jansen", place: "John's Gym"),
            Self.item(Self.kracht, johns, "15:00", "16:00", className: "Kracht"),
            Self.item(Self.krachtCancelled, johns, "18:00", "19:00", className: "Kracht", cancelled: true)
        ]
        let shown = (which == .solo ? Array(items.prefix(2)) : items).map(markCancelled)
        let nextIsCancelled = isCancelled(Self.anna)
        var answer: [String: Any] = [
            "date": date, "timeZone": StubSessionRoutes.zone, "workspaceCount": which == .solo ? 1 : 2,
            "items": shown,
            "summary": ["count": shown.count, "done": 0, "firstStartsAt": Self.instant("09:00"),
                        "lastEndsAt": Self.instant(which == .solo ? "12:00" : "19:00")],
            "freeGap": ["startsAt": Self.instant("12:00"), "endsAt": Self.instant("13:30")],
            "placesAhead": (which == .solo ? ["John's Gym"] : ["TrainMore Zuid", "John's Gym"]).map { ["name": $0] },
            "tomorrow": ["date": "2026-09-23", "count": 3, "firstStartsAt": Self.instant("07:00", "2026-09-23")],
            "hasSessions": true
        ].merging(Self.sessionTypes(which)) { $1 }
        // A cancelled session is no next one.
        if !nextIsCancelled { answer["next"] = ["sessionId": Self.anna, "state": "upcoming", "startsInMinutes": 25] }
        return (200, answer)
    }

    /// The item as the API lists it once the session was cancelled from its screen.
    private func markCancelled(_ item: [String: Any]) -> [String: Any] {
        guard let id = item["sessionId"] as? String, isCancelled(id) else { return item }
        var cancelled = item
        cancelled["status"] = "cancelled"
        return cancelled
    }

    // MARK: The range of days of Agenda (F013, TD-04)

    /// Lisa Smit at the same time as Mark Jansen, so *Dag* shows two blocks side by side on 22 September.
    static let overlap = "8a0b1c2e-8a54-4b51-9a42-0000000000d1"
    /// Wednesday 23 September 2026: three sessions from 07:00 (the *Morgen* line of Vandaag).
    static let tomorrowEarly = "8a0b1c2e-8a54-4b51-9a42-0000000000e1"
    static let tomorrowMid = "8a0b1c2e-8a54-4b51-9a42-0000000000e2"
    static let tomorrowEvening = "8a0b1c2e-8a54-4b51-9a42-0000000000e3"
    /// The class "Kracht" at 18:00 on Tuesday 20 and Tuesday 27 October 2026, on both sides of the change of the clocks.
    static let krachtOctober20 = "8a0b1c2e-8a54-4b51-9a42-0000000000f1"
    static let markOctober22 = "8a0b1c2e-8a54-4b51-9a42-0000000000f2"
    static let krachtOctober27 = "8a0b1c2e-8a54-4b51-9a42-0000000000f3"

    /// `GET /api/v1/me/sessions`: Sarah's Tuesday 22 September 2026 as `respond` has it, with Lisa at 11:00 too, her
    /// three sessions from 07:00 on 23 September, and the weeks of 19 and 26 October 2026 (the clocks go back on Sunday
    /// 25 October; the class "Kracht" is at 18:00 on both Tuesdays). It answers the days from `from` to `to`, and an empty
    /// list for the others.
    func respondSessions(from first: String, through last: String) -> (status: Int, json: [String: Any]) {
        let which = day
        let johns = Self.workspace(0, "John's Gym")
        let sarah = Self.workspace(1, "Sarah Personal Training")
        /// A private session: `times` is "09:00-10:00"; the place is the one of its workspace.
        func visit(
            _ id: String, _ day: String, _ times: String, _ workspace: [String: Any], _ client: String
        ) -> (day: String, json: [String: Any]) {
            let span = times.split(separator: "-").map(String.init)
            let place = workspace["name"] as? String == "John's Gym" ? "John's Gym" : "TrainMore Zuid"
            return (day, Self.item(id, workspace, span[0], span[1], client: client, place: place, day: day))
        }
        func lesson(
            _ id: String, _ day: String, _ times: String, _ name: String, cancelled: Bool = false
        ) -> (day: String, json: [String: Any]) {
            let span = times.split(separator: "-").map(String.init)
            return (day, Self.item(id, johns, span[0], span[1], className: name, cancelled: cancelled, day: day))
        }
        let all = [
            visit(Self.anna, "2026-09-22", "09:00-10:00", sarah, "Anna de Vries"),
            visit(Self.mark, "2026-09-22", "11:00-12:00", johns, "Mark Jansen"),
            visit(Self.overlap, "2026-09-22", "11:00-12:00", johns, "Lisa Smit"),
            lesson(Self.kracht, "2026-09-22", "15:00-16:00", "Kracht"),
            lesson(Self.krachtCancelled, "2026-09-22", "18:00-19:00", "Kracht", cancelled: true),
            visit(Self.tomorrowEarly, "2026-09-23", "07:00-08:00", johns, "Eva Kok"),
            visit(Self.tomorrowMid, "2026-09-23", "10:00-11:00", sarah, "Anna de Vries"),
            lesson(Self.tomorrowEvening, "2026-09-23", "17:00-18:00", "Boksen"),
            lesson(Self.krachtOctober20, "2026-10-20", "18:00-19:00", "Kracht"),
            visit(Self.markOctober22, "2026-10-22", "11:00-12:00", johns, "Mark Jansen"),
            lesson(Self.krachtOctober27, "2026-10-27", "18:00-19:00", "Kracht")
        ]
        let shown = which == .empty ? [] : all.filter { $0.day >= first && $0.day <= last }
            .filter { which == .sarah || $0.json["type"] as? String == "private" }
        return (200, [
            "from": first, "to": last, "timeZone": StubSessionRoutes.zone, "workspaceCount": which == .solo ? 1 : 2,
            "items": shown.map { markCancelled($0.json) }
        ].merging(Self.sessionTypes(which)) { $1 })
    }

    // MARK: The workspace's day (F014)

    static let sarahID = "5b1c2d3e-0000-4000-8000-0000000000a3"
    static let sarahName = "Sarah de Boer"
    static let studioMark = "8a0b1c2e-8a54-4b51-9a42-0000000000c1"
    static let studioLisa = "8a0b1c2e-8a54-4b51-9a42-0000000000c3"
    static let studioBoxing = "8a0b1c2e-8a54-4b51-9a42-0000000000c4"
    /// John's Gym's Tuesday 22 September 2026 for John, the Owner (`ownName`) who also trains, with Sarah and Tom: the
    /// seeded private session of `StubSessionRoutes` is John's own at 18:00 and the seeded class date Sarah's Kracht at
    /// 10:00; Boxing runs at 18:00 too, so two sessions are at once from 18:00 to 19:00.
    func respondWorkspaceDay(date: String, ownName: String) -> (status: Int, json: [String: Any]) {
        let own: [String: Any] = ["id": StubSessionRoutes.myMemberID, "name": ownName]
        let sarah: [String: Any] = ["id": Self.sarahID, "name": Self.sarahName]
        let tom: [String: Any] = ["id": StubSessionRoutes.otherMemberID, "name": StubSessionRoutes.otherTrainerName]
        func session(
            _ id: String, _ start: String, _ end: String, trainer: [String: Any], client: String? = nil,
            className: String? = nil
        ) -> [String: Any] {
            var item: [String: Any] = [
                "id": id, "type": className == nil ? "private" : "group", "status": "scheduled",
                "startsAt": Self.instant(start), "endsAt": Self.instant(end), "timeZone": StubSessionRoutes.zone,
                "capacity": className == nil ? 1 : 8, "version": 1, "location": Self.place("John's Gym"),
                "trainer": trainer
            ]
            if className != nil { item["booked"] = 0 }
            if let className { item["className"] = className }
            if let client { item["clientName"] = client }
            return item
        }
        let items = date == Self.day ? [
            session(Self.studioMark, "07:00", "08:00", trainer: sarah, client: "Mark Jansen"),
            session(Self.kracht, "10:00", "11:00", trainer: sarah, className: "Kracht"),
            session(Self.studioLisa, "11:00", "12:00", trainer: tom, client: "Lisa Smit"),
            session(Self.anna, "18:00", "19:00", trainer: own, client: "Anna de Vries"),
            session(Self.studioBoxing, "18:00", "19:00", trainer: sarah, className: "Boxing")
        ] : [[String: Any]]()
        var day: [String: Any] = [
            "date": date, "timeZone": StubSessionRoutes.zone, "items": items, "attention": [Any](), "hasSessions": true
        ]
        if !items.isEmpty {
            day["busiest"] = [
                "startsAt": Self.instant("18:00"), "endsAt": Self.instant("19:00"), "timeZone": StubSessionRoutes.zone,
                "atOnce": 2
            ]
        }
        return (200, day)
    }
}

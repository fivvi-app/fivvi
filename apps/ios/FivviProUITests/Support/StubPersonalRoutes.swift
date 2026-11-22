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

    private static func place(_ name: String) -> [String: Any] {
        [
            "id": "6d1c2d3e-0000-4000-8000-0000000000b1", "name": name, "type": "external_gym", "isDefault": false,
            "address": ["postcode": "1234 AB", "houseNumber": "12", "houseNumberAddition": NSNull(),
                        "street": "Kerkstraat", "city": "Amsterdam"]
        ]
    }

    private static func item(
        _ id: String, _ workspace: [String: Any], _ start: String, _ end: String, client: String? = nil,
        className: String? = nil, cancelled: Bool = false, place name: String? = nil
    ) -> [String: Any] {
        var item: [String: Any] = [
            "sessionId": id, "workspace": workspace, "type": className == nil ? "private" : "group",
            "status": cancelled ? "cancelled" : "scheduled", "startsAt": instant(start), "endsAt": instant(end),
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
            ])
        }
        let johns = Self.workspace(0, "John's Gym")
        let sarah = Self.workspace(1, "Sarah Personal Training")
        let items = [
            Self.item(Self.anna, sarah, "09:00", "10:00", client: "Anna de Vries", place: "TrainMore Zuid"),
            Self.item(Self.mark, johns, "11:00", "12:00", client: "Mark Jansen", place: "John's Gym"),
            Self.item(Self.kracht, johns, "15:00", "16:00", className: "Kracht"),
            Self.item(Self.krachtCancelled, johns, "18:00", "19:00", className: "Kracht", cancelled: true)
        ]
        let shown = which == .solo ? Array(items.prefix(2)) : items
        return (200, [
            "date": date, "timeZone": StubSessionRoutes.zone, "workspaceCount": which == .solo ? 1 : 2,
            "items": shown,
            "summary": ["count": shown.count, "done": 0, "firstStartsAt": Self.instant("09:00"),
                        "lastEndsAt": Self.instant(which == .solo ? "12:00" : "19:00")],
            "next": ["sessionId": Self.anna, "state": "upcoming", "startsInMinutes": 25],
            "freeGap": ["startsAt": Self.instant("12:00"), "endsAt": Self.instant("13:30")],
            "placesAhead": (which == .solo ? ["John's Gym"] : ["TrainMore Zuid", "John's Gym"]).map { ["name": $0] },
            "tomorrow": ["date": "2026-09-23", "count": 3, "firstStartsAt": Self.instant("07:00", "2026-09-23")],
            "hasSessions": true
        ])
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

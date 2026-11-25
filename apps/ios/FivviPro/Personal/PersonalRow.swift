import Foundation
import FivviAPI
import FivviStrings
import FivviUI

typealias PersonalDay = Components.Schemas.MyDay
typealias PersonalItem = Components.Schemas.PersonalSession
typealias PersonalSessions = Components.Schemas.MySessions

/// A line of Vandaag (TD-01), and later of Agenda (TD-04): one item of the personal scope, worded in the app's language
/// and in Dutch time. Nothing here decides anything: what the API sent is written down, and the words that only fit when
/// the person has more than one kind (the API says so) or team are left out otherwise (F013 AC2, the design of `DECISIONS.md` §3).
struct PersonalRow: Identifiable, Equatable {
    let id: String
    let workspaceID: String
    let workspaceName: String
    let isGroup: Bool
    let title: String
    /// *09:00–10:00*
    let timeText: String
    let startText: String
    let endText: String
    /// *Privésessie* / *Groepsles*: only when the caller says the rows name their kind (`PersonalRows.namesKinds`).
    let typeLabel: String?
    /// The workspace's name, with its colour dot: only when the person is on more than one team.
    let workspaceLabel: String?
    let location: String?
    let routeURL: URL?
    /// *3/8* or *Vol*, for a class.
    let pill: String?
    let pillIsFull: Bool
    let isCancelled: Bool
    let isPast: Bool
    /// "09:00 tot 10:00, Anna de Vries, privésessie, John's Gym, Sarah Personal Training": one VoiceOver element, and
    /// it always names the type.
    let spokenLabel: String
    /// *Jij*, a trainer's name or *Geen trainer*: only on the workspace's day (*Hele studio*, F014), where each row names
    /// its trainer.
    var trainerText: String?
}

/// Builds the rows of a list of items.
struct PersonalRows {
    let catalog: Catalog
    let now: Date
    let workspaceCount: Int
    /// Whether each row names its kind. The caller decides: *Vandaag* and *Agenda* pass the API's `showsKindLabel`
    /// (the person's workspaces run more than one session type, #1534); *Hele studio* still works it out from the
    /// workspace's own day.
    let namesKinds: Bool

    /// The personal day is in Dutch time (F013 AC14); the workspace's day (*Hele studio*) in the workspace's own zone.
    static let timeZone = DateEyebrow.defaultTimeZone
    let timeZone: TimeZone

    private var format: SessionFormat { SessionFormat(locale: catalog.formattingLocale, timeZone: timeZone) }

    init(
        namesKinds: Bool, workspaceCount: Int, catalog: Catalog, now: Date, timeZone: TimeZone = PersonalRows.timeZone
    ) {
        self.timeZone = timeZone
        self.catalog = catalog
        self.now = now
        self.workspaceCount = workspaceCount
        self.namesKinds = namesKinds
    }

    func typeWord(_ item: PersonalItem) -> String {
        typeWord(isGroup: item._type == .group)
    }

    func typeWord(isGroup: Bool) -> String {
        catalog[isGroup ? .todayTypeGroup : .todayTypePrivate]
    }

    func row(_ item: PersonalItem) -> PersonalRow {
        let isGroup = item._type == .group
        return row(Facts(
            id: item.sessionId, workspaceID: item.workspace.id, workspaceName: item.workspace.name, isGroup: isGroup,
            title: (isGroup ? item.className : item.clientName) ?? "", startsAt: item.startsAt, endsAt: item.endsAt,
            location: item.location, booked: item.booked, capacity: item.capacity,
            isCancelled: item.status == .cancelled
        ))
    }

    /// What a row is written from, whichever route the item came from.
    struct Facts {
        let id: String
        let workspaceID: String
        let workspaceName: String
        let isGroup: Bool
        let title: String
        let startsAt: Date
        let endsAt: Date
        let location: Components.Schemas.Location?
        let booked: Int?
        let capacity: Int
        let isCancelled: Bool
        var trainerText: String?
    }

    func row(_ facts: Facts) -> PersonalRow {
        let start = format.time(facts.startsAt)
        let end = format.time(facts.endsAt)
        let location = facts.location?.name
        let pill: String? = facts.isGroup ? facts.booked.map { booked in
            booked >= facts.capacity
                ? catalog[.todayFull] : catalog.string(.todayBookedPill, String(booked), String(facts.capacity))
        } : nil
        let spoken = [
            catalog.string(.todaySpokenTime, end, start), facts.title, typeWord(isGroup: facts.isGroup).lowercased(),
            location, workspaceCount > 1 ? facts.workspaceName : nil, facts.trainerText,
            facts.isCancelled ? catalog[.todayCancelled] : nil
        ].compactMap { $0 }
        return PersonalRow(
            id: facts.id, workspaceID: facts.workspaceID, workspaceName: facts.workspaceName, isGroup: facts.isGroup,
            title: facts.title, timeText: catalog.string(.todayTimeRange, end, start), startText: start, endText: end,
            typeLabel: namesKinds ? typeWord(isGroup: facts.isGroup) : nil,
            workspaceLabel: workspaceCount > 1 ? facts.workspaceName : nil,
            location: facts.isGroup ? nil : location,
            routeURL: facts.isGroup ? nil : LocationRoute.url(facts.location?.address),
            pill: pill, pillIsFull: pill == catalog[.todayFull], isCancelled: facts.isCancelled,
            isPast: facts.endsAt <= now,
            spokenLabel: spoken.dropFirst().reduce(spoken[0]) { catalog.string(.todaySpokenJoin, $0, $1) },
            trainerText: facts.trainerText
        )
    }
}

/// The maps app's address for a location (`Route`, `↗`).
enum LocationRoute {
    static func url(_ address: Components.Schemas.LocationAddress?) -> URL? {
        guard let address else { return nil }
        let number = [address.houseNumber, address.houseNumberAddition].compactMap { $0 }.joined(separator: " ")
        var parts = URLComponents(string: "https://maps.apple.com/")
        parts?.queryItems = [
            URLQueryItem(name: "daddr", value: "\(address.street) \(number), \(address.postcode) \(address.city)"),
            URLQueryItem(name: "dirflg", value: "d")
        ]
        return parts?.url
    }
}

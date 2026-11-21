import Foundation
import FivviAPI
import FivviStrings
import FivviUI

typealias PersonalDay = Components.Schemas.MyDay
typealias PersonalItem = Components.Schemas.PersonalSession

/// A line of Vandaag (TD-01), and later of Agenda (TD-04): one item of the personal scope, worded in the app's language
/// and in Dutch time. Nothing here decides anything: what the API sent is written down, and the words that only fit when
/// the person has more than one kind or team are left out otherwise (F013 AC2, the design of `DECISIONS.md` §3).
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
    /// *Privésessie* / *Groepsles*: only when the person's items are of more than one kind.
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
}

/// Builds the rows of a list of items.
struct PersonalRows {
    let catalog: Catalog
    let now: Date
    let workspaceCount: Int
    /// The items are of more than one kind, so each row names its kind.
    let namesKinds: Bool

    static let timeZone = DateEyebrow.defaultTimeZone

    private var format: SessionFormat { SessionFormat(locale: catalog.formattingLocale, timeZone: Self.timeZone) }

    init(items: [PersonalItem], workspaceCount: Int, catalog: Catalog, now: Date) {
        self.catalog = catalog
        self.now = now
        self.workspaceCount = workspaceCount
        namesKinds = Set(items.map(\._type)).count > 1
    }

    func typeWord(_ item: PersonalItem) -> String {
        catalog[item._type == .group ? .todayTypeGroup : .todayTypePrivate]
    }

    func row(_ item: PersonalItem) -> PersonalRow {
        let start = format.time(item.startsAt)
        let end = format.time(item.endsAt)
        let isGroup = item._type == .group
        let title = (isGroup ? item.className : item.clientName) ?? ""
        let location = item.location?.name
        let pill: String? = isGroup ? item.booked.map { booked in
            booked >= item.capacity
                ? catalog[.todayFull] : catalog.string(.todayBookedPill, String(booked), String(item.capacity))
        } : nil
        let spoken = [
            catalog.string(.todaySpokenTime, end, start), title, typeWord(item).lowercased(), location,
            workspaceCount > 1 ? item.workspace.name : nil, item.status == .cancelled ? catalog[.todayCancelled] : nil
        ].compactMap { $0 }
        return PersonalRow(
            id: item.sessionId, workspaceID: item.workspace.id, workspaceName: item.workspace.name, isGroup: isGroup,
            title: title, timeText: catalog.string(.todayTimeRange, end, start), startText: start, endText: end,
            typeLabel: namesKinds ? typeWord(item) : nil,
            workspaceLabel: workspaceCount > 1 ? item.workspace.name : nil,
            location: isGroup ? nil : location, routeURL: isGroup ? nil : LocationRoute.url(item.location?.address),
            pill: pill, pillIsFull: pill == catalog[.todayFull], isCancelled: item.status == .cancelled,
            isPast: item.endsAt <= now,
            spokenLabel: spoken.dropFirst().reduce(spoken[0]) { catalog.string(.todaySpokenJoin, $0, $1) }
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

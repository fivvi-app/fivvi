import Foundation
import Observation
import FivviAPI
import FivviStrings
import FivviUI

/// TD-01 *Vandaag* (F013, the design of `DECISIONS.md` §3): everything the person is the trainer of today, in all their
/// workspaces, from `GET /api/v1/me/day` through the generated client. The server decides the summary, *Straks*, the
/// free gap and the places ahead; this model words them. The last answer is kept on the phone: without a connection it
/// stays on screen with *Je bent offline. Laatst bijgewerkt om {time}.*, and an answer that fails otherwise leaves it
/// there with *Opnieuw*. A workspace the person was on and is not any more shows its notice once.
@MainActor
@Observable
final class TodayViewModel {
    enum State: Equatable {
        case loading
        case loaded
        /// Nothing is known to show: no answer yet and none kept for today.
        case failed
    }

    private(set) var state = State.loading
    private(set) var day: PersonalDay?
    /// The day on screen is the phone's copy: the connection failed. `updatedAt` is when it was read.
    private(set) var isOffline = false
    private(set) var updateFailed = false
    private(set) var updatedAt: Date?
    /// *Je hebt geen toegang meer tot John's Gym.*, one per workspace that is gone, until the person closes it.
    private(set) var notices: [String] = []
    private(set) var catalog: Catalog
    private(set) var now: Date
    private let api: any APIProtocol
    private let cache: PersonalCache
    private let clock: () -> Date
    private let deviceTimeZone: TimeZone
    /// Reads `GET /api/v1/me` again and answers the workspaces it lists, or nil when that failed.
    private let refreshAccount: @MainActor () async -> [PersonalCache.Workspace]?

    init(
        api: any APIProtocol, catalog: Catalog, store: any PersonalStore, now: @escaping () -> Date = Date.init,
        deviceTimeZone: TimeZone = .autoupdatingCurrent,
        refreshAccount: @escaping @MainActor () async -> [PersonalCache.Workspace]? = { nil }
    ) {
        self.api = api
        self.catalog = catalog
        cache = PersonalCache(store: store)
        clock = now
        self.now = now()
        self.deviceTimeZone = deviceTimeZone
        self.refreshAccount = refreshAccount
    }

    /// The time now on the model's clock, for the countdown on the next card.
    var clockNow: Date { clock() }

    func use(_ catalog: Catalog) { self.catalog = catalog }

    private var format: SessionFormat {
        SessionFormat(locale: catalog.formattingLocale, timeZone: PersonalRows.timeZone)
    }

    // MARK: Loading

    /// Pull to refresh and *Opnieuw*: the account is read again too (a workspace the person lost shows its notice) and
    /// so is the day.
    func refresh() async {
        async let listed = refreshAccount()
        await load()
        if let listed = await listed { workspacesListed(listed) }
    }

    /// Reads today again (opening, foreground, pull to refresh, the OS's time-change signals, *Opnieuw*).
    func load() async {
        now = clock()
        let date = SessionClock.localDate(now, in: PersonalRows.timeZone)
        do {
            let output = try await api.getMyDay(.init(query: .init(date: date, surface: .ios)))
            guard case let .ok(answer) = output else { return failed(.failed, date: date) }
            let fresh = try answer.body.json
            day = fresh
            state = .loaded
            isOffline = false
            updateFailed = false
            updatedAt = now
            cache.day = .init(day: fresh, savedAt: now)
        } catch {
            failed(ClientRequestError(thrown: error), date: date)
        }
    }

    private func failed(_ error: ClientRequestError, date: String) {
        if error == .cancelled { return }
        if let shown = day, shown.date != date {
            // Offline across midnight, or reopened the next morning: yesterday's day is not today's.
            day = nil
            updatedAt = nil
        }
        if day == nil, let kept = cache.day, kept.day.date == date {
            day = kept.day
            updatedAt = kept.savedAt
            state = .loaded
        }
        guard day != nil else {
            state = .failed
            isOffline = error == .offline
            return
        }
        isOffline = error == .offline
        updateFailed = error != .offline
    }

    /// The account's workspaces after `GET /api/v1/me`: one the phone knew and the list lacks says so once.
    func workspacesListed(_ listed: [PersonalCache.Workspace]) {
        let gone = (cache.workspaces ?? []).filter { known in !listed.contains { $0.id == known.id } }
        notices.append(contentsOf: gone.map { catalog.string(.todayRemoved, $0.name) })
        cache.workspaces = listed
    }

    func dismissNotices() { notices = [] }

    // MARK: Texts

    private var items: [PersonalItem] { (day?.items ?? []).filter { $0._type != .openGym } }
    private var rowBuilder: PersonalRows {
        PersonalRows(items: items, workspaceCount: day?.workspaceCount ?? 1, catalog: catalog, now: now)
    }

    var eyebrow: String { DateEyebrow.text(for: now, locale: catalog.formattingLocale) }

    /// *4 sessies · 09:00–19:00 · 1 klaar*, or *Geen sessies vandaag*.
    var summaryText: String? {
        guard let day else { return nil }
        guard day.summary.count > 0, let first = day.summary.firstStartsAt, let last = day.summary.lastEndsAt else {
            return catalog[.todaySummaryEmpty]
        }
        return catalog.string(
            .todaySummary, day.summary.count, String(day.summary.done), format.time(first), format.time(last)
        )
    }

    /// *Vrij 11:00–15:00* and *4 uur*, with the start *Plannen* hands PS-04.
    struct FreeGap: Equatable {
        let text: String
        let length: String
        let start: Date
    }

    /// *Te doen* of F025 will join this card as its first row; the card shows what the list doesn't tell.
    struct Card: Equatable {
        /// Nil when no gap is left.
        let gap: FreeGap?
        let noFreeTime: String?
        /// *Studio Fit → Park*, only with two places or more.
        let route: String?
    }

    var card: Card? {
        guard let day, !items.isEmpty else { return nil }
        let places = (day.placesAhead ?? []).map(\.name)
        return Card(
            gap: day.freeGap.map { gap in
                let hours = gap.endsAt.timeIntervalSince(gap.startsAt) / 3600
                return FreeGap(
                    text: catalog.string(.todayFreeGap, format.time(gap.startsAt), format.time(gap.endsAt)),
                    length: catalog.string(.todayFreeGapLength, Self.hours(hours, locale: catalog.formattingLocale)),
                    start: gap.startsAt
                )
            },
            noFreeTime: day.freeGap == nil ? catalog[.todayNoFreeTime] : nil,
            route: places.count >= 2 ? places.joined(separator: " → ") : nil
        )
    }

    /// *1,5*, *2*: hours with at most one decimal.
    static func hours(_ hours: Double, locale: Locale) -> String {
        let formatter = NumberFormatter()
        formatter.locale = locale
        formatter.maximumFractionDigits = 1
        formatter.minimumFractionDigits = 0
        return formatter.string(from: NSNumber(value: hours)) ?? String(hours)
    }

    /// The gradient card: the item the API names as next.
    var next: (row: PersonalRow, item: PersonalItem)? {
        guard let day, let next = day.next, let item = items.first(where: { $0.sessionId == next.sessionId })
        else { return nil }
        return (rowBuilder.row(item), item)
    }

    /// *Straks · over 25 min* or *Nu bezig*, counted from the server's instants as time passes.
    func nextCaption(at date: Date) -> String {
        guard let next, let state = day?.next?.state else { return "" }
        if state == .inProgress || next.item.startsAt <= date { return catalog[.todayNextInProgress] }
        let minutes = Int((next.item.startsAt.timeIntervalSince(date) / 60).rounded(.up))
        return catalog.string(.todayNextUpcoming, String(minutes))
    }

    /// *09:00–10:00 · TrainMore Zuid · Sarah Personal Training*: with the kind in words when there is more than one, and
    /// the workspace when the person is on more than one team.
    var nextSubtitle: String? {
        guard let next else { return nil }
        let parts = [next.row.timeText, next.row.typeLabel, next.row.location, next.row.workspaceLabel]
        return parts.compactMap { $0 }.joined(separator: " · ")
    }

    /// Every other item of today in time order; the next one is not repeated.
    var rows: [PersonalRow] {
        let nextID = day?.next?.sessionId
        return items.filter { $0.sessionId != nextID }.map(rowBuilder.row)
    }

    /// The empty day's text: *Geen sessies vandaag.*, with the date of the next session, or that there are none at all.
    var emptyText: String? {
        guard let day, items.isEmpty else { return nil }
        // The API also sends `nextSessionDate` when tomorrow has sessions: the *Morgen* line says it then.
        if day.tomorrow == nil, let next = day.nextSessionDate, let text = format.day(localDate: next) {
            return catalog.string(.todayEmptyNext, text)
        }
        return catalog[day.hasSessions ? .todayEmptyToday : .todayEmptyNever]
    }

    /// *Morgen: 3 sessies, eerste om 07:00*, which opens Agenda on `tomorrowDate`.
    var tomorrowText: String? {
        guard let tomorrow = day?.tomorrow, tomorrow.count > 0 else { return nil }
        return catalog.string(.todayTomorrow, tomorrow.count, format.time(tomorrow.firstStartsAt))
    }

    var tomorrowDate: String? { day?.tomorrow?.date }

    var offlineText: String? {
        guard isOffline, let updatedAt else { return isOffline ? catalog[.commonOffline] : nil }
        return catalog.string(.todayOffline, format.time(updatedAt))
    }

    var failedText: String? { updateFailed || state == .failed && !isOffline ? catalog[.todayFailed] : nil }

    /// *Tijden in Nederlandse tijd*, when the phone is on another clock than Amsterdam's (F013 AC14).
    var timeZoneHint: String? {
        let amsterdam = PersonalRows.timeZone
        return deviceTimeZone.secondsFromGMT(for: now) == amsterdam.secondsFromGMT(for: now)
            ? nil : catalog[.timeZoneHint]
    }
}

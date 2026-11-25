import Foundation
import Observation
import FivviAPI
import FivviStrings
import FivviUI

/// TD-04 *Agenda* (F013, the design of `DECISIONS.md` §3, iOS): *Dag | Week | Maand* of everything the person is the
/// trainer of, in all their workspaces, from `GET /api/v1/me/sessions` through the generated client. One request reads the
/// days a view shows (the seven of the week, or the weeks of the month grid), and picking a day or the other view of the
/// same days asks for nothing. The last answers are kept on the phone: without a connection they stay on screen with *Je
/// bent offline. Laatst bijgewerkt om {time}.*, and an answer that fails otherwise leaves them there with *Opnieuw*. The
/// server decides which sessions there are; this model decides which days, dots and notes a view shows and words them.
@MainActor
@Observable
final class AgendaModel {
    enum Mode: Hashable {
        case day, week, month
    }

    enum State: Equatable {
        case loading
        case loaded
        /// Nothing is known to show: no answer yet and none kept for these days.
        case failed
    }

    /// A dot under a day: the colour of the session's type.
    enum Kind: Equatable {
        case privateSession, group
    }

    /// The days one request reads.
    struct Range: Hashable {
        let from: String
        let until: String
    }

    /// A day of the strip or of the month grid.
    struct DayCell: Identifiable, Equatable {
        var id: String { day }
        let day: String
        /// 22
        let number: Int
        /// The weekday's letter, *D*.
        let weekday: String
        let isToday: Bool
        let isSelected: Bool
        /// A day of the grid in another month: dimmed.
        let isOutsideMonth: Bool
        /// One per session that takes place, at most three.
        let dots: [Kind]
        /// How many sessions take place (cancelled ones not counted).
        let count: Int
        /// *dinsdag 22 september*, with *Vandaag ·* in front of today.
        let label: String
        /// *3 sessies*, the spoken name of the dots; nil for a day without.
        let countLabel: String?
    }

    /// A day of the week list: its heading and its rows, or the line that it has none.
    struct Section: Identifiable, Equatable {
        var id: String { day }
        let day: String
        /// *Vandaag · dinsdag 22 september* or *woensdag 23 september*.
        let heading: String
        let rows: [PersonalRow]
        let emptyText: String?
    }

    private enum Result {
        case success, offline, failed
    }

    private struct Loaded {
        let response: PersonalSessions
        let savedAt: Date
    }

    private(set) var mode = Mode.week
    private(set) var selectedDay: String
    private(set) var catalog: Catalog
    private(set) var now: Date
    private var loaded: [Range: Loaded] = [:]
    /// How the last read of each range went.
    private var results: [Range: Result] = [:]
    private let api: any APIProtocol
    private let cache: PersonalCache
    private let clock: () -> Date
    private let deviceTimeZone: TimeZone
    private let calendar = AgendaCalendar(timeZone: PersonalRows.timeZone)

    init(
        api: any APIProtocol, catalog: Catalog, store: any PersonalStore, now: @escaping () -> Date = Date.init,
        deviceTimeZone: TimeZone = .autoupdatingCurrent
    ) {
        self.api = api
        self.catalog = catalog
        cache = PersonalCache(store: store)
        clock = now
        let start = now()
        self.now = start
        self.deviceTimeZone = deviceTimeZone
        selectedDay = AgendaCalendar(timeZone: PersonalRows.timeZone).day(of: start)
    }

    /// The time now on the model's clock, for the now-line as time passes.
    var clockNow: Date { clock() }

    func use(_ catalog: Catalog) { self.catalog = catalog }

    private var format: SessionFormat {
        SessionFormat(locale: catalog.formattingLocale, timeZone: PersonalRows.timeZone)
    }

    // MARK: Which days

    func show(_ mode: Mode) { self.mode = mode }

    func select(_ day: String) { selectedDay = day }

    /// *Morgen* on Vandaag opens Agenda on that day, in the week view (the prototype's `S.aview = "week"`).
    func open(day: String) {
        mode = .week
        selectedDay = day
    }

    /// *Vandaag* in the bar.
    func goToToday() { selectedDay = calendar.day(of: clock()) }

    func stepWeek(_ weeks: Int) { selectedDay = calendar.adding(days: 7 * weeks, to: selectedDay) }

    func stepMonth(_ months: Int) { selectedDay = calendar.adding(months: months, to: selectedDay) }

    /// The days the view on screen shows: the week of the selected day, or the grid of its month.
    var visibleDays: [String] {
        mode == .month ? calendar.monthGrid(of: selectedDay) : calendar.week(of: selectedDay)
    }

    /// The days a request reads: it changes only when the view shows other days.
    var rangeKey: Range {
        let days = visibleDays
        return Range(from: days.first ?? selectedDay, until: days.last ?? selectedDay)
    }

    // MARK: Loading

    /// Reads the days on screen (opening, another week or month, the foreground, pull to refresh, *Opnieuw*).
    func load() async {
        now = clock()
        let key = rangeKey
        do {
            let query = Operations.ListMySessions.Input.Query(from: key.from, to: key.until, surface: .ios)
            let output = try await api.listMySessions(.init(query: query))
            guard case let .ok(answer) = output else { return failed(.failed, key) }
            let fresh = try answer.body.json
            loaded[key] = Loaded(response: fresh, savedAt: now)
            results[key] = .success
            cache.keep(.init(from: key.from, until: key.until, response: fresh, savedAt: now))
        } catch {
            failed(ClientRequestError(thrown: error), key)
        }
    }

    private func failed(_ error: ClientRequestError, _ key: Range) {
        if error == .cancelled { return }
        let kept = cache.sessions.first { $0.from == key.from && $0.until == key.until }
        if loaded[key] == nil, let kept {
            loaded[key] = Loaded(response: kept.response, savedAt: kept.savedAt)
        }
        results[key] = error == .offline ? .offline : .failed
    }

    private var current: Loaded? { loaded[rangeKey] }

    var state: State {
        if current != nil { return .loaded }
        return results[rangeKey] == nil ? .loading : .failed
    }

    /// The days on screen are the phone's copy: the connection failed.
    var isOffline: Bool { results[rangeKey] == .offline }

    /// The read failed for another reason than the connection, and the days on screen are an earlier one's.
    var updateFailed: Bool { results[rangeKey] == .failed && current != nil }

    var offlineText: String? {
        guard isOffline else { return nil }
        guard let saved = current?.savedAt else { return catalog[.commonOffline] }
        return catalog.string(.todayOffline, format.time(saved))
    }

    var failedText: String? {
        updateFailed || state == .failed && !isOffline ? catalog[.calendarFailed] : nil
    }

    /// *Tijden in Nederlandse tijd*, when the phone is on another clock than Amsterdam's (F013 AC14).
    var timeZoneHint: String? {
        let amsterdam = PersonalRows.timeZone
        return deviceTimeZone.secondsFromGMT(for: now) == amsterdam.secondsFromGMT(for: now)
            ? nil : catalog[.timeZoneHint]
    }

    // MARK: Sessions

    /// Open Gym comes later (`PRODUCT.md §53`): no screen shows it.
    private var items: [PersonalItem] { (current?.response.items ?? []).filter { $0._type != .openGym } }

    private func items(on day: String) -> [PersonalItem] {
        items.filter { calendar.day(of: $0.startsAt) == day }
    }

    private func rowBuilder(at now: Date) -> PersonalRows {
        PersonalRows(
            namesKinds: current?.response.showsKindLabel ?? false,
            workspaceCount: current?.response.workspaceCount ?? 1, catalog: catalog, now: now
        )
    }

    /// The rows of a day, TD-01's rows, in time order.
    func rows(on day: String) -> [PersonalRow] {
        let builder = rowBuilder(at: now)
        return items(on: day).map(builder.row)
    }

    var selectedRows: [PersonalRow] { rows(on: selectedDay) }

    /// *Geen sessies op deze dag.*, once the days are read and the selected one has none.
    var emptyText: String? {
        state == .loaded && selectedRows.isEmpty ? catalog[.calendarEmptyDay] : nil
    }

    // MARK: Texts

    private func start(of day: String) -> Date { calendar.start(of: day) ?? now }

    private func cell(_ day: String, letter: String) -> DayCell {
        let sessions = items(on: day).filter { $0.status != .cancelled }
        let name = format.weekdayDay(start(of: day))
        let isToday = day == calendar.day(of: now)
        return DayCell(
            day: day, number: calendar.dayNumber(of: day), weekday: letter, isToday: isToday,
            isSelected: day == selectedDay, isOutsideMonth: mode == .month && !calendar.isInMonth(day, of: selectedDay),
            dots: sessions.prefix(3).map { $0._type == .group ? Kind.group : Kind.privateSession },
            count: sessions.count, label: isToday ? catalog.string(.calendarTodayHeading, name) : name,
            countLabel: sessions.isEmpty ? nil : catalog.string(.calendarDots, sessions.count)
        )
    }

    /// The weekday letters, Monday first: *M D W D V Z Z*.
    var weekdayLetters: [String] {
        let formatter = DateFormatter()
        formatter.locale = catalog.formattingLocale
        let symbols = formatter.veryShortStandaloneWeekdaySymbols ?? []
        guard symbols.count == 7 else { return Array(repeating: "", count: 7) }
        return (1...7).map { symbols[$0 % 7] }
    }

    /// The week of the selected day: the strip of *Dag* and *Week*.
    var strip: [DayCell] {
        let letters = weekdayLetters
        return calendar.week(of: selectedDay).enumerated().map { cell($1, letter: letters[$0]) }
    }

    /// The month grid, Monday first.
    var grid: [DayCell] {
        let letters = weekdayLetters
        return calendar.monthGrid(of: selectedDay).enumerated().map { cell($1, letter: letters[$0 % 7]) }
    }

    /// *Week 43 · 19 okt – 25 okt 2026*
    var weekLine: String {
        let week = calendar.week(of: selectedDay)
        guard let first = week.first, let last = week.last else { return "" }
        let range = catalog.string(
            .calendarRange, format.dayMonthYear(start(of: last)), format.dayMonth(start(of: first))
        )
        return catalog.string(.calendarWeekLine, range, String(calendar.weekNumber(of: selectedDay)))
    }

    /// *Oktober 2026*
    var monthTitle: String { format.monthYear(start(of: selectedDay)).localizedCapitalized }

    /// *zo 25 okt: wintertijd, de klok gaat 1 uur terug* for the days of the view the clocks change on.
    var clockNotes: [String] {
        calendar.clockChanges(in: visibleDays).map { change in
            catalog.string(
                change.change == .back ? .calendarClockBack : .calendarClockForward, format.day(start(of: change.day))
            )
        }
    }

    /// The week list of *Week*: a day each, under its date.
    var weekSections: [Section] {
        let empty = catalog[.calendarEmptyDay]
        return calendar.week(of: selectedDay).map { day in
            let rows = rows(on: day)
            let name = format.weekdayDay(start(of: day))
            return Section(
                day: day, heading: day == calendar.day(of: now) ? catalog.string(.calendarTodayHeading, name) : name,
                rows: rows, emptyText: rows.isEmpty ? empty : nil
            )
        }
    }

    /// *Dag*: the selected day as a timeline, at `now` for the now-line and the dimmed past.
    func timeline(at now: Date) -> AgendaTimeline? {
        let builder = rowBuilder(at: now)
        let entries = items(on: selectedDay).map {
            AgendaTimeline.Entry(row: builder.row($0), startsAt: $0.startsAt, endsAt: $0.endsAt)
        }
        return AgendaTimeline.make(entries: entries, day: selectedDay, now: now, calendar: calendar)
    }

    var previousWeekLabel: String { catalog[.calendarPreviousWeek] }
    var nextWeekLabel: String { catalog[.calendarNextWeek] }
    var previousMonthLabel: String { catalog[.calendarPreviousMonth] }
    var nextMonthLabel: String { catalog[.calendarNextMonth] }
}

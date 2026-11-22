import Foundation
import Observation
import FivviAPI
import FivviStrings
import FivviUI

/// The Owner's *Mijn dag | Hele studio* on Vandaag (F014 AC11, the design of `DECISIONS.md` §3, iOS): the control, and the
/// workspace's day read-only from `GET /api/v1/workspaces/{id}/day` through the generated client. The API decides the day,
/// the busiest moment and who may read it (`calendar.manage`); this model words them and draws the lanes. The control shows
/// by the ticket's and `DECISIONS.md` §3's rule: the person has calendar.manage and the workspace has a team, more than one
/// trainer, which `GET …/trainers` answers; whether the Owner trains too does not matter (an Owner who doesn't has an empty
/// *Mijn dag*, as TD-01 shows one). A solo PT and a Trainer have none, and no studio view.
@MainActor
@Observable
final class StudioDayModel {
    enum Scope: Hashable {
        case mine, studio
    }

    enum State: Equatable {
        case loading
        case loaded
        /// Nothing is known to show: no answer yet.
        case failed
    }

    private(set) var scope = Scope.mine
    private(set) var state = State.loading
    private(set) var day: Components.Schemas.WorkspaceDay?
    /// The day on screen is the last answer: the connection failed.
    private(set) var isOffline = false
    private(set) var updateFailed = false
    private(set) var catalog: Catalog
    private(set) var workspace: CurrentWorkspace?
    private var canManage = false
    /// The workspace's trainers, once read; nil until then and when they can't be read.
    private var trainers: [Components.Schemas.Trainer]?
    private let api: any APIProtocol
    private let clock: () -> Date
    /// The API answered `403` to the day: the capability helper is told, so it reads the account again.
    private let onForbidden: @MainActor () async -> Void

    init(
        api: any APIProtocol, catalog: Catalog, now: @escaping () -> Date = Date.init,
        onForbidden: @escaping @MainActor () async -> Void = {}
    ) {
        self.api = api
        self.catalog = catalog
        clock = now
        self.onForbidden = onForbidden
    }

    func use(_ catalog: Catalog) { self.catalog = catalog }

    /// The time now on the model's clock, for the now-line and the next card as time passes.
    var clockNow: Date { clock() }

    // MARK: The control

    /// The workspace has a team: more than one trainer (`calendar.manage` decides who may ask at all).
    var showsToggle: Bool {
        guard canManage, workspace != nil, let trainers else { return false }
        return trainers.count > 1
    }

    var isStudio: Bool { showsToggle && scope == .studio }
    var scopeMineText: String { catalog[.todayScopeMine] }
    var scopeStudioText: String { catalog[.todayScopeStudio] }

    /// The workspace the app shows and whether the person may manage its calendar (`calendar.manage`, from the capability
    /// helper). Another workspace is another day: what was read for the last one goes, and the control is Mijn dag again.
    func configure(workspace: CurrentWorkspace?, canManage: Bool) async {
        let changed = workspace?.id != self.workspace?.id || !canManage || !self.canManage
        self.workspace = workspace
        self.canManage = canManage
        if changed { reset() }
        await readTrainers()
    }

    private func reset() {
        scope = .mine
        state = .loading
        day = nil
        isOffline = false
        updateFailed = false
        trainers = nil
    }

    func select(_ scope: Scope) async {
        guard showsToggle else { return }
        self.scope = scope
        guard scope == .studio, !isToday(day) else { return }
        // A day that is not today is not shown as today: it goes while today is read.
        day = nil
        state = .loading
        await load()
    }

    /// The day read is today in the workspace's time zone.
    private func isToday(_ day: Components.Schemas.WorkspaceDay?) -> Bool {
        guard let day, let workspace else { return false }
        return day.date == SessionClock.localDate(clock(), in: workspace.timeZone)
    }

    /// `GET …/trainers`: who trains here. A read that fails leaves what was known.
    private func readTrainers() async {
        guard canManage, let workspace else { return }
        let id = workspace.id
        let read = try? await SessionTeam.readTrainers(api: api, workspaceID: id)
        guard self.workspace?.id == id else { return }
        if let read { trainers = read }
    }

    // MARK: Loading

    /// Pull to refresh, the foreground, *Opnieuw*: who trains, and the day when the studio is on screen.
    func refresh() async {
        await readTrainers()
        if isStudio { await load() }
    }

    /// Reads today in the workspace again.
    func load() async {
        guard let workspace else { return }
        let id = workspace.id
        let date = SessionClock.localDate(clock(), in: workspace.timeZone)
        do {
            let output = try await api.getWorkspaceDay(.init(path: .init(workspaceId: id), query: .init(date: date)))
            guard self.workspace?.id == id else { return }
            switch output {
            case let .ok(answer):
                day = try answer.body.json
                state = .loaded
                isOffline = false
                updateFailed = false
            case .forbidden:
                await forbidden()
            default:
                failed(.failed)
            }
        } catch {
            guard self.workspace?.id == id else { return }
            failed(ClientRequestError(thrown: error))
        }
    }

    private func failed(_ error: ClientRequestError) {
        if error == .cancelled { return }
        isOffline = error == .offline
        updateFailed = day != nil && error != .offline
        if day == nil { state = .failed }
    }

    /// The API refused the day: no control and no studio view, and the capability helper hears it.
    private func forbidden() async {
        canManage = false
        reset()
        await onForbidden()
    }

    var failedText: String? {
        updateFailed || state == .failed && !isOffline ? catalog[.todayFailed] : nil
    }

    var offlineText: String? { isOffline ? catalog[.commonOffline] : nil }

    // MARK: Texts

    private var words: TrainerWordForms { TrainerWordForms(workspace?.trainerWord ?? .trainer, catalog: catalog) }
    private var ownID: String { workspace?.teamMemberId ?? "" }

    /// *Alles bij John's Gym vandaag, van alle trainers.*
    var line: String? {
        guard let workspace else { return nil }
        return catalog.string(.studioLine, words.words, workspace.name)
    }

    private typealias Item = Components.Schemas.WorkspaceCalendarSession

    /// The sessions of the day, Open Gym left out (it comes later, `PRODUCT.md §53`).
    private var items: [Item] { (day?.items ?? []).filter { $0._type != .openGym } }

    /// The sessions that take place: the lanes and the next card leave a cancelled one out.
    private var taking: [Item] { items.filter { $0.status == .scheduled } }

    private func trainerText(_ item: Item) -> String {
        guard let trainer = item.trainer?.value1 else { return catalog.string(.studioNoTrainer, words.word) }
        return trainer.id == ownID ? catalog[.studioYou] : trainer.name
    }

    /// The workspace's time zone: the day's own, as the API sent it.
    private var zone: TimeZone {
        day.flatMap { TimeZone(identifier: $0.timeZone) } ?? workspace?.timeZone ?? PersonalRows.timeZone
    }

    private func rowBuilder(at now: Date) -> PersonalRows {
        PersonalRows(
            namesKinds: Set(items.map(\._type)).count > 1, workspaceCount: 1, catalog: catalog, now: now,
            timeZone: zone
        )
    }

    private func row(_ item: Item, with builder: PersonalRows) -> PersonalRow {
        let isGroup = item._type == .group
        return builder.row(.init(
            id: item.id, workspaceID: workspace?.id ?? "", workspaceName: workspace?.name ?? "", isGroup: isGroup,
            title: (isGroup ? item.className : item.clientName) ?? builder.typeWord(isGroup: isGroup),
            startsAt: item.startsAt, endsAt: item.endsAt, location: item.location, booked: item.booked,
            capacity: item.capacity, isCancelled: item.status == .cancelled, trainerText: trainerText(item)
        ))
    }

    /// The head of the team card, the busiest moment and the lanes. With nothing taking place the head says so.
    struct TeamCard: Equatable {
        /// *3 trainers*, or *Geen sessies vandaag*.
        let head: String
        /// *Drukst 18:00–19:00 · 2 tegelijk* or *Geen overlap*; nil for a day with no sessions.
        let busiest: String?
        let timeline: StudioTimeline?
    }

    func team(at now: Date) -> TeamCard? {
        guard let day else { return nil }
        let builder = rowBuilder(at: now)
        let context = StudioTimeline.Context(
            ownID: ownID, catalog: catalog, nobody: catalog.string(.studioNoTrainer, words.word),
            rows: { self.row($0, with: builder) }
        )
        guard let timeline = StudioTimeline.make(items: taking, timeZone: zone, now: now, context: context) else {
            return TeamCard(head: catalog[.todaySummaryEmpty], busiest: nil, timeline: nil)
        }
        let count = timeline.trainerCount
        let moment = day.busiest.map { busiest in
            let time = SessionFormat(
                locale: catalog.formattingLocale, timeZone: TimeZone(identifier: busiest.timeZone) ?? zone
            )
            return catalog.string(
                .studioBusiest, String(busiest.atOnce), time.time(busiest.startsAt), time.time(busiest.endsAt)
            )
        }
        return TeamCard(
            head: count == 1
                ? catalog.string(.studioTrainersOne, String(count), words.word)
                : catalog.string(.studioTrainersMany, String(count), words.words),
            busiest: moment ?? catalog[.studioNoOverlap], timeline: timeline
        )
    }

    /// The first session that has not ended, as the web's *Nog vandaag* has it (a cancelled one is none).
    func next(at now: Date) -> (row: PersonalRow, item: Components.Schemas.WorkspaceCalendarSession)? {
        guard let item = taking.first(where: { $0.endsAt > now }) else { return nil }
        return (row(item, with: rowBuilder(at: now)), item)
    }

    /// *Straks · over 25 min* or *Nu bezig*, counted from the server's instants.
    func nextCaption(at now: Date) -> String {
        guard let next = next(at: now) else { return "" }
        if next.item.startsAt <= now { return catalog[.todayNextInProgress] }
        let minutes = Int((next.item.startsAt.timeIntervalSince(now) / 60).rounded(.up))
        return catalog.string(.todayNextUpcoming, String(minutes))
    }

    /// *10:00–11:00 · Groepsles*, and under it *Trainer: Sarah* (or *jij*; *Geen trainer* for a session with none).
    func nextSubtitle(at now: Date) -> String? {
        guard let next = next(at: now) else { return nil }
        let parts = [next.row.timeText, next.row.typeLabel, next.row.location]
        let first = parts.compactMap { $0 }.joined(separator: " · ")
        guard let trainer = next.item.trainer?.value1 else { return first + "\n" + trainerText(next.item) }
        let name = trainer.id == ownID ? catalog[.studioYouLower] : trainer.name
        return first + "\n" + catalog.string(.studioTrainer, words.wordCap, name)
    }

    /// Every other session of the day in time order, with its trainer; the next one is not repeated.
    func rows(at now: Date) -> [PersonalRow] {
        let builder = rowBuilder(at: now)
        let nextID = next(at: now)?.row.id
        return items.filter { $0.id != nextID }.map { row($0, with: builder) }
    }
}

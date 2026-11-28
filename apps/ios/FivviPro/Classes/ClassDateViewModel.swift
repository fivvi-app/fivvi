import Foundation
import Observation
import FivviAPI
import FivviStrings

/// TD-03 *Groepsles* (F021 AC3, AC5, AC7 and the design of `DECISIONS.md` §3): a class on a date as everyone on the team
/// reads it. The name in the viewer's language (else Dutch), the date and time, the location, the trainer or *Trainer
/// nodig*, *{booked}/{capacity} geboekt* and *Nog geen boekingen.*, the description in the viewer's language (else
/// Dutch, marked as Dutch) cut to a few lines with *Meer* / *Minder*. The Owner's ⋯ menu has *Les wijzigen*, which says
/// the class is managed on the web. Read from `GET …/sessions/{id}` and, for the description, `GET …/group-classes/{id}`
/// through the generated client; what is shown stays when a later read fails. A date in a weekly series (F022 AC6) says
/// *Onderdeel van: {class}, elke {weekday} {time}*, from the series the API sends with the date. The participants and their attendance (F025) are in `ClassDateViewModel+Participants`.
@MainActor
@Observable
final class ClassDateViewModel {
    typealias Session = Components.Schemas.Session

    enum State: Equatable {
        case loading
        case loaded
        case failed
        /// The API refused this date (the team access is gone, or it is not in the workspace).
        case noPermission
    }

    private(set) var state = State.loading
    private(set) var session: Session?
    private(set) var groupClass: Components.Schemas.GroupClass?
    private(set) var descriptionOpen = false
    /// *Toon alle {n}* was tapped (`ClassDateViewModel+Participants`).
    private(set) var participantsOpen = false
    private(set) var manageOnWebText: String?
    /// The confirmation of *Les annuleren*, once the API said who would get the email; nil when it is not asked.
    private(set) var cancelAsk: CancelAsk?
    private(set) var cancelFailure: CancelFailure?
    /// The last read or cancellation couldn't reach the API (the fallback when the phone's network path said online);
    /// coming through clears the share's too.
    private var requestFailedOffline = false { didSet { if !requestFailedOffline { share.clearOffline() } } }
    private(set) var isCancelling = false
    private(set) var catalog: Catalog
    let workspace: CurrentWorkspace
    /// The person has `class.manage`: they get the ⋯ menu and the footnote.
    let canManage: Bool
    /// The person has `booking_link.copy` (the Owner and the Trainers): they get *Boekingslink delen* (F037).
    let canShareLink: Bool
    /// How many dates the person just added (a new class opens here): 12 for a weekly class, else 1; nil for a date
    /// opened from the calendar.
    private let added: Int?
    private let sessionID: String
    private let api: any APIProtocol
    /// Whether the phone is online, from the network path (`Connectivity`); a model made without one says online.
    private let isOnline: @MainActor () -> Bool
    /// Told once the date is cancelled, so the lists that show it (Vandaag, Agenda) read again.
    private let onCancelled: @MainActor () -> Void
    /// *Boekingslink delen*: the request, the toast and what went wrong (`ClassDateViewModel+ShareLink`).
    let share: BookingLinkShare
    /// The time now, to tell a date to come from one that has started.
    let now: () -> Date
    private let onForbidden: @MainActor (WorkspaceCapabilities.Capability) async -> Void

    init(
        api: any APIProtocol, workspace: CurrentWorkspace, sessionID: String, catalog: Catalog, canManage: Bool,
        canShareLink: Bool = false, added: Int? = nil,
        isOnline: @escaping @MainActor () -> Bool = { true },
        onCancelled: @escaping @MainActor () -> Void = {},
        copy: @escaping @MainActor (String) -> Void = { _ in },
        now: @escaping () -> Date = Date.init,
        onForbidden: @escaping @MainActor (WorkspaceCapabilities.Capability) async -> Void = { _ in }
    ) {
        self.isOnline = isOnline
        self.onCancelled = onCancelled
        self.api = api
        self.workspace = workspace
        self.sessionID = sessionID
        self.catalog = catalog
        self.canManage = canManage
        self.canShareLink = canShareLink
        self.share = BookingLinkShare(
            api: api, workspaceID: workspace.id, sessionID: sessionID, copy: copy, onForbidden: onForbidden
        )
        self.now = now
        self.added = added
        self.onForbidden = onForbidden
    }

    private var timeZone: TimeZone { session.flatMap { TimeZone(identifier: $0.timeZone) } ?? workspace.timeZone }
    private var format: SessionFormat { SessionFormat(locale: catalog.formattingLocale, timeZone: timeZone) }
    var words: TrainerWordForms { TrainerWordForms(workspace.trainerWord, catalog: catalog) }

    /// What the confirmation of *Les annuleren* tells.
    struct CancelAsk: Equatable {
        /// How many people get the cancellation email.
        let participants: Int
        /// The date has started: it is recorded for the record and nobody gets an email.
        let started: Bool
    }

    /// What a cancellation that didn't happen says.
    enum CancelFailure: Equatable {
        case changed(byName: String?)
        case cancelled
        case noPermission
        case notSaved
    }

    // MARK: Texts

    /// The class's name in the viewer's language: the English name for an English viewer and a class that has one, else
    /// the Dutch name (`pickContentLanguage`).
    var title: String {
        guard let groupClass = session?.groupClass else { return "" }
        return Self.pick(catalog, dutch: groupClass.nameNl, english: groupClass.nameEn)?.text ?? groupClass.nameNl
    }

    /// *dinsdag 6 oktober 2026, 18:00–19:00*
    var whenText: String {
        guard let session else { return "" }
        return catalog.string(
            .classDateTimeRange, format.longDay(session.startsAt), format.time(session.endsAt),
            format.time(session.startsAt)
        )
    }

    var locationName: String { session?.location.name ?? "" }
    var trainerLabel: String { catalog.string(.classDateTrainerLabel, words.wordCap) }
    var bookedLabel: String { catalog[.classDateBookedLabel] }

    /// The trainer: *Jij* for the person looking, else the name, or *Trainer nodig* without one. On a substituted date
    /// (F024) everyone but the substitute reads *Mike (vervangt Sarah)*.
    var trainerText: String {
        guard let trainer = session?.trainer else { return catalog.string(.classFormTrainerNeeded, words.wordCap) }
        if trainer.id == workspace.teamMemberId { return catalog[.sessionPageYou] }
        guard let original = originalTrainer else { return trainer.name }
        // Placeholders in the order of their names: original, substitute.
        return catalog.string(.classDateSubstituteLabel, original, trainer.name)
    }

    /// The places taken: the clients who have not cancelled.
    var booked: Int { session?.participants.filter { $0.attendanceStatus != .cancelled }.count ?? 0 }

    /// *0/8 geboekt · 8 plekken vrij*
    var bookedText: String {
        let capacity = session?.capacity ?? 0
        // Placeholders in the order of their names: booked, capacity, free.
        return catalog.string(.classDateBooked, String(booked), String(capacity), max(0, capacity - booked))
    }

    var noBookingsText: String { catalog[.classDateNoBookings] }
    var showsNoBookings: Bool { booked == 0 }

    /// "Groepsles toegevoegd", or "12 groepslessen toegevoegd" for a weekly class, on the screen the new class opens on.
    var addedText: String? {
        guard let added else { return nil }
        return added > 1 ? catalog.string(.classDateAddedSeries, added) : catalog[.classDateAdded]
    }

    /// *Onderdeel van: Kracht, elke donderdag 18:00*, for a date in a weekly series; nil for a date on its own.
    var seriesLineText: String? {
        guard let series = session?.series else { return nil }
        // Placeholders in the order of their names: name, time, weekday.
        return catalog.string(
            .classDateSeriesLine, title, series.localStartTime, format.weekdayName(number: series.weekday.number)
        )
    }

    // MARK: The description

    private var description: (text: String, isDutchFallback: Bool)? {
        guard let groupClass else { return nil }
        return Self.pick(catalog, dutch: groupClass.descriptionNl, english: groupClass.descriptionEn)
    }

    /// The description in the viewer's language, else Dutch; nil when the class has none to show.
    var descriptionText: String? { description?.text }

    /// An English viewer reads the Dutch text: it is marked as Dutch.
    var descriptionIsDutchFallback: Bool { description?.isDutchFallback ?? false }
    var descriptionMarkText: String? { descriptionIsDutchFallback ? catalog[.classDateInDutch] : nil }

    /// *Meer* while the text is cut, *Minder* once it is open; nil without a description.
    var descriptionToggleText: String? {
        guard descriptionText != nil else { return nil }
        return catalog[descriptionOpen ? .classDateLess : .classDateMore]
    }

    func toggleDescription() { descriptionOpen.toggle() }
    /// *Toon alle {n}*.
    func showAllParticipants() { participantsOpen = true }

    /// The text of a class in the viewer's language, else Dutch (`pickContentLanguage`); never translated. A blank text
    /// is none.
    private static func pick(
        _ catalog: Catalog, dutch: String?, english: String?
    ) -> (text: String, isDutchFallback: Bool)? {
        if catalog.locale == .en, let english, !english.isEmpty { return (english, false) }
        guard let dutch, !dutch.isEmpty else { return nil }
        return (dutch, catalog.locale == .en)
    }

    // MARK: The ⋯ menu

    /// The Owner's menu, until the date is cancelled; a Trainer has none, a covering one neither: only the Owner substitutes
    /// (Q40), and on the web.
    var hasMenu: Bool { canManage && !isCancelled }
    var editText: String { catalog[.classDateEdit] }

    /// *Vervang de trainer* (F024): substituting is managed on the web, and the screen says so.
    func substituteTapped() { manageOnWebText = catalog[.classDateManageOnWeb] }

    /// *Les wijzigen*: the class is managed on the web, and the screen says so.
    func editTapped() { manageOnWebText = catalog[.classDateManageOnWeb] }

    /// "Les wijzigen, een vaste reeks en trainers beheer je op het web." for the Owner.
    var ownerNoteText: String? { canManage && !isCancelled ? catalog.string(.classDateOwnerNote, words.words) : nil }

    func use(_ catalog: Catalog) {
        self.catalog = catalog
        if manageOnWebText != nil { manageOnWebText = catalog[.classDateManageOnWeb] }
    }

    // MARK: Reading

    func load() async {
        state = .loading
        await read()
    }

    /// Reads the date again and leaves what is on screen until the answer is there.
    func refresh() async {
        await read()
    }

    private func read() async {
        do {
            switch try await api.getSession(.init(path: .init(workspaceId: workspace.id, sessionId: sessionID))) {
            case let .ok(found):
                session = try found.body.json
                state = .loaded
                requestFailedOffline = false
            case .forbidden:
                await onForbidden(.class_read)
                state = .noPermission
            case .notFound:
                state = .noPermission
            default:
                failed()
                return
            }
        } catch {
            let cause = ClientRequestError(thrown: error)
            if cause == .offline { requestFailedOffline = true }
            if cause != .cancelled { failed() }
            return
        }
        await readClass()
    }

    /// The description is on the class, not on the date. Only to fill the screen, so a failure here changes nothing.
    private func readClass() async {
        guard let id = session?.groupClass?.id else { return }
        let input = Operations.GetGroupClass.Input(path: .init(workspaceId: workspace.id, classId: id))
        if case let .ok(found)? = try? await api.getGroupClass(input) {
            groupClass = try? found.body.json
        }
    }

    private func failed() {
        if state != .loaded { state = .failed }
    }
}

extension ClassDateViewModel {
    // MARK: Les annuleren (F026)

    var isCancelled: Bool { session?.status == .cancelled }

    /// The Owner may cancel a date that is still planned (`class.manage`).
    var canCancel: Bool { canManage && session?.status == .scheduled }

    /// *Les annuleren* is off: the network path says offline, or the last read or cancellation couldn't reach the API.
    var isOffline: Bool { requestFailedOffline || share.requestFailedOffline || !isOnline() }

    /// *Les annuleren* is on while the phone is online (nothing is queued).
    var canStartCancel: Bool { canCancel && !isOffline && !isCancelling }
    var cancelText: String { catalog[.classCancelAction] }
    var cancelTitleText: String { catalog[.classCancelTitle] }
    var cancelSubmitText: String { catalog[.classCancelSubmit] }
    var cancelBackText: String { catalog[.classCancelBack] }

    /// "De 3 geboekte klanten krijgen een e-mail. Je kunt er een bericht bij zetten op het web.", or that nobody gets an
    /// email without participants, or for a date that has started.
    var cancelMessageText: String {
        guard let cancelAsk else { return "" }
        if cancelAsk.started { return catalog[.classCancelStarted] }
        if cancelAsk.participants == 0 { return catalog[.classCancelCountNone] }
        return catalog.string(.classCancelBody, cancelAsk.participants)
    }

    /// *Je bent offline. Annuleren kan als je weer verbinding hebt.*, where *Les annuleren* is off for lack of a connection.
    var cancelOfflineText: String? { isOffline && canCancel ? catalog[.classCancelOffline] : nil }

    var cancelFailureText: String? {
        switch cancelFailure {
        case let .changed(name):
            name.map { catalog.string(.classCancelChangedBy, $0) } ?? catalog[.classCancelChangedByUnknown]
        case .cancelled: catalog[.classCancelAlreadyCancelled]
        case .noPermission: catalog[.classCancelNoPermission]
        case .notSaved: catalog[.classCancelNotSaved]
        case nil: nil
        }
    }

    /// "Geannuleerd op di 20 okt om 10:12 door John", on a cancelled date; nil otherwise.
    var cancelledText: String? {
        guard isCancelled else { return nil }
        guard let cancellation = session?.cancellation else { return catalog[.classCancelAlreadyCancelled] }
        let day = format.day(cancellation.cancelledAt)
        let time = format.time(cancellation.cancelledAt)
        // Placeholders in the order of their names: date, name, time.
        return cancellation.cancelledBy.map { catalog.string(.classDateCancelledBanner, day, $0.value1.name, time) }
            ?? catalog.string(.classDateCancelledBannerUnknown, day, time)
    }

    /// *Les annuleren* of the ⋯ menu: asks the API who would get the email, then the confirmation shows. When the API
    /// can't be reached nothing is asked and the screen says it is offline.
    func askToCancel() async {
        guard canStartCancel else { return }
        cancelFailure = nil
        do {
            switch try await api.previewClassCancellation(
                .init(path: .init(workspaceId: workspace.id, sessionId: sessionID))
            ) {
            case let .ok(found):
                let preview = try found.body.json
                requestFailedOffline = false
                cancelAsk = CancelAsk(participants: preview.thisDate.participants, started: preview.started)
            case .forbidden:
                await onForbidden(.class_manage)
                cancelFailure = .noPermission
            case .conflict:
                // Cancelled already: the screen reads it as it is now.
                cancelFailure = .cancelled
                await read()
            default:
                cancelFailure = .notSaved
            }
        } catch {
            if ClientRequestError(thrown: error) == .offline {
                requestFailedOffline = true
            } else {
                cancelFailure = .notSaved
            }
        }
    }

    /// *Terug*: nothing is cancelled.
    func dismissCancel() { cancelAsk = nil }

    /// *Les annuleren* of the confirmation: cancels this date only, with the `version` the person saw.
    func confirmCancel() async {
        guard let session, !isCancelling, session.status == .scheduled else { return }
        cancelAsk = nil
        cancelFailure = nil
        isCancelling = true
        defer { isCancelling = false }
        let body = Components.Schemas.CancelClassDateRequest(scope: .this, version: session.version, surface: .ios)
        do {
            let input = Operations.CancelClassDate.Input(
                path: .init(workspaceId: workspace.id, sessionId: session.id), body: .json(body)
            )
            switch try await api.cancelClassDate(input) {
            case let .ok(cancelled):
                self.session = try cancelled.body.json.session.value1
                requestFailedOffline = false
                onCancelled()
            case let .conflict(conflict):
                let refusal = try conflict.body.json
                self.session = refusal.session.value1
                cancelFailure = refusal.code == .sessionCancelled
                    ? .cancelled : .changed(byName: refusal.changedBy?.name)
                if refusal.code == .sessionCancelled { onCancelled() }
            case .forbidden:
                await onForbidden(.class_manage)
                cancelFailure = .noPermission
            default:
                cancelFailure = .notSaved
            }
        } catch {
            if ClientRequestError(thrown: error) == .offline {
                requestFailedOffline = true
            } else {
                cancelFailure = .notSaved
            }
        }
    }
}

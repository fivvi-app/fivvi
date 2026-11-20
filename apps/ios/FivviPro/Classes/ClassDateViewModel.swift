import Foundation
import Observation
import FivviAPI
import FivviStrings

/// TD-03 *Groepsles* (F021 AC3, AC5, AC7 and the design of `DECISIONS.md` §3): a class on a date as everyone on the team
/// reads it. The name in the viewer's language (else Dutch), the date and time, the location, the trainer or *Trainer
/// nodig*, *{booked}/{capacity} geboekt* and *Nog geen boekingen.*, the description in the viewer's language (else
/// Dutch, marked as Dutch) cut to a few lines with *Meer* / *Minder*. The Owner's ⋯ menu has *Les wijzigen*, which says
/// the class is managed on the web. Read from `GET …/sessions/{id}` and, for the description, `GET …/group-classes/{id}`
/// through the generated client; what is shown stays when a later read fails. Bookings and attendance come with M5/F025.
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
    private(set) var manageOnWebText: String?
    private(set) var catalog: Catalog
    let workspace: CurrentWorkspace
    /// The person has `class.manage`: they get the ⋯ menu and the footnote.
    let canManage: Bool
    private let justAdded: Bool
    private let sessionID: String
    private let api: any APIProtocol
    private let onForbidden: @MainActor (WorkspaceCapabilities.Capability) async -> Void

    init(
        api: any APIProtocol, workspace: CurrentWorkspace, sessionID: String, catalog: Catalog, canManage: Bool,
        justAdded: Bool = false,
        onForbidden: @escaping @MainActor (WorkspaceCapabilities.Capability) async -> Void = { _ in }
    ) {
        self.api = api
        self.workspace = workspace
        self.sessionID = sessionID
        self.catalog = catalog
        self.canManage = canManage
        self.justAdded = justAdded
        self.onForbidden = onForbidden
    }

    private var timeZone: TimeZone { session.flatMap { TimeZone(identifier: $0.timeZone) } ?? workspace.timeZone }
    private var format: SessionFormat { SessionFormat(locale: catalog.formattingLocale, timeZone: timeZone) }
    private var words: TrainerWordForms { TrainerWordForms(workspace.trainerWord, catalog: catalog) }

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

    /// The trainer: *Jij* for the person looking, else the name, or *Trainer nodig* without one.
    var trainerText: String {
        guard let trainer = session?.trainer else { return catalog.string(.classFormTrainerNeeded, words.wordCap) }
        return trainer.id == workspace.teamMemberId ? catalog[.sessionPageYou] : trainer.name
    }

    /// The places taken: the clients who have not cancelled.
    private var booked: Int { session?.participants.filter { $0.attendanceStatus != .cancelled }.count ?? 0 }

    /// *0/8 geboekt · 8 plekken vrij*
    var bookedText: String {
        let capacity = session?.capacity ?? 0
        // Placeholders in the order of their names: booked, capacity, free.
        return catalog.string(.classDateBooked, String(booked), String(capacity), max(0, capacity - booked))
    }

    var noBookingsText: String { catalog[.classDateNoBookings] }
    var showsNoBookings: Bool { booked == 0 }
    var isCancelled: Bool { session?.status == .cancelled }

    /// "Groepsles toegevoegd", on the screen the new class opens on.
    var addedText: String? { justAdded ? catalog[.classDateAdded] : nil }

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

    /// The Owner's menu; a Trainer who is not substituting has none (F024 adds the substitute's).
    var hasMenu: Bool { canManage }
    var editText: String { catalog[.classDateEdit] }

    /// *Les wijzigen*: the class is managed on the web, and the screen says so.
    func editTapped() { manageOnWebText = catalog[.classDateManageOnWeb] }

    /// "Les wijzigen, een vaste reeks en trainers beheer je op het web." for the Owner.
    var ownerNoteText: String? { canManage ? catalog.string(.classDateOwnerNote, words.words) : nil }

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
            if ClientRequestError(thrown: error) != .cancelled { failed() }
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

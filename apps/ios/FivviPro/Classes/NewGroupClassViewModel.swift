import Foundation
import Observation
import FivviAPI
import FivviStrings

/// TD-05 *Nieuwe groepsles* (F021 AC6, the Owner; F022 AC6, AC7, *Herhalen*: *Niet herhalen* or *Elke week op
/// {weekday}*, which asks the API for the weekly series and its 12 dates): the name and description in Dutch and
/// English, the date, the start and the end, the capacity, the trainer (or *Trainer nodig*) and the default location.
/// The API creates the class and its one date in one request (`POST …/group-classes` with a `firstDate`, so a refused
/// date leaves no class behind) and decides every rule; the form only collects, shows what the API refused per field and
/// keeps what was typed. Without a connection the form says so and *Opslaan* is off; nothing is queued.
@MainActor
@Observable
final class NewGroupClassViewModel: Identifiable {
    typealias Session = Components.Schemas.Session
    typealias Trainer = Components.Schemas.Trainer

    enum Load: Equatable {
        case loading
        case ready
        /// The API answered, but not with what the form needs.
        case failed
        /// The API couldn't be reached.
        case offline
        /// The API refused the workspace's data: the person has no access (any more).
        case noPermission
    }

    /// What went wrong with a save that the fields don't show.
    enum SaveFailure: Equatable {
        case noPermission
        case notSaved
    }

    /// The fields the API names in a `400`.
    enum Field: Hashable {
        case nameNl, nameEn, descriptionNl, descriptionEn, capacity, duration
    }

    /// The API's limits (`packages/contract`: the names ≤ 80, the descriptions ≤ 500, capacity 1–100, a duration of 15
    /// to 240 minutes in steps of 5); they only fill the refusal texts.
    private enum Limits {
        static let name = 80
        static let description = 500
        static let capacity = 1...100
        static let duration = 15...240
        static let step = 5
    }

    static let defaultCapacity = 12
    static let defaultMinutes = 60

    let id = UUID()
    private(set) var load = Load.loading
    var nameNl = ""
    var nameEn = ""
    var descriptionNl = ""
    var descriptionEn = ""
    var capacity = NewGroupClassViewModel.defaultCapacity
    /// The trainer chosen (the team-member ID); empty is *Trainer nodig*.
    var trainerID = ""
    /// The date, the start and the length; the end is the start plus the length.
    let time: SessionTimeFields
    private(set) var trainers: [Trainer] = []
    private(set) var locationName = ""
    private(set) var myTrainerID: String?
    private(set) var refused: [Field: String] = [:]
    /// *Herhalen*: every week on the weekday of the date. The API makes the series and its dates and decides every rule.
    var repeatsWeekly = false
    /// How many dates the API put in the calendar: 12 for a weekly class, else 1.
    private(set) var datesAdded = 1
    /// The date (`YYYY-MM-DD`) the API named when it refused a start the clocks skip: the weekly class's first such date.
    private var skippedDate: String?
    private(set) var saveFailure: SaveFailure?
    /// PS-07: the API found something else of the trainer's at that time (`409` `trainer_conflict`); nothing was stored.
    private(set) var doubleBooking: DoubleBooking?
    private(set) var isSaving = false
    private(set) var catalog: Catalog
    private var sawOffline = false
    let workspace: CurrentWorkspace
    private let api: any APIProtocol
    private let email: String
    private let accountName: String?
    private let firstStart: Date
    private let onForbidden: @MainActor (WorkspaceCapabilities.Capability) async -> Void

    init(
        api: any APIProtocol, workspace: CurrentWorkspace, catalog: Catalog, email: String, accountName: String?,
        now: Date = Date(),
        onForbidden: @escaping @MainActor (WorkspaceCapabilities.Capability) async -> Void = { _ in }
    ) {
        self.api = api
        self.workspace = workspace
        self.catalog = catalog
        self.email = email
        self.accountName = accountName
        self.onForbidden = onForbidden
        firstStart = SessionClock.nextFullHour(after: now, in: workspace.timeZone)
        time = SessionTimeFields(
            start: firstStart, durationMinutes: Self.defaultMinutes, timeZone: workspace.timeZone, catalog: catalog
        )
    }

    // MARK: Texts

    var isOffline: Bool { load == .offline || sawOffline }
    var canSave: Bool { load == .ready && !isOffline && !isSaving }
    var offlineText: String? { isOffline ? catalog[.sessionFormOffline] : nil }
    var loadFailedText: String { catalog[.sessionFormLoadFailed] }
    var noPermissionText: String { catalog.string(.noPermissionBody, workspace.name) }
    var words: TrainerWordForms { TrainerWordForms(workspace.trainerWord, catalog: catalog) }
    var titleText: String { catalog[.newGroupClassTitle] }
    var nameSectionText: String { catalog[.classFormNameSection] }
    var classSectionText: String { catalog[.classFormClassSection] }
    var whenSectionText: String { catalog[.classFormWhenSection] }
    var nameNlLabel: String { catalog[.classFormNameNl] }
    var nameEnLabel: String { catalog[.classFormNameEn] }
    var descriptionNlLabel: String { catalog[.classFormDescriptionNl] }
    var descriptionEnLabel: String { catalog[.classFormDescriptionEn] }
    var descriptionNote: String { catalog[.classFormDescriptionNote] }
    var capacityLabel: String { catalog[.classFormCapacity] }
    var trainerLabel: String { catalog.string(.classDateTrainerLabel, words.wordCap) }
    var trainerNeededText: String { catalog.string(.classFormTrainerNeeded, words.wordCap) }
    var endLabel: String { catalog[.classFormEnd] }
    var locationText: String { catalog.string(.classFormLocation, locationName) }
    var repeatLabel: String { catalog[.classFormRepeatLabel] }
    var nameErrorText: String? {
        switch refused[.nameNl] {
        case "too_big": catalog.string(.classFormErrorNameTooLong, String(Limits.name))
        case nil: nil
        default: catalog[.classFormErrorNameRequired]
        }
    }

    var nameEnErrorText: String? {
        refused[.nameEn] == nil ? nil : catalog.string(.classFormErrorNameTooLong, String(Limits.name))
    }

    var descriptionNlErrorText: String? { descriptionError(.descriptionNl) }

    var descriptionEnErrorText: String? { descriptionError(.descriptionEn) }

    private func descriptionError(_ field: Field) -> String? {
        refused[field] == nil ? nil : catalog.string(.classFormErrorDescriptionTooLong, String(Limits.description))
    }

    var capacityErrorText: String? {
        guard refused[.capacity] != nil else { return nil }
        // Placeholders in the order of their names: max, min.
        return catalog.string(
            .classFormErrorCapacity, String(Limits.capacity.upperBound), String(Limits.capacity.lowerBound)
        )
    }

    /// A length the API refused: an end that is not after the start, or one outside 15 to 240 minutes in steps of 5.
    var endErrorText: String? {
        guard refused[.duration] != nil else { return nil }
        if time.durationMinutes <= 0 { return catalog[.classFormErrorEndBeforeStart] }
        // Placeholders in the order of their names: max, min, step.
        return catalog.string(
            .classFormErrorDuration, String(Limits.duration.upperBound), String(Limits.duration.lowerBound),
            String(Limits.step)
        )
    }

    var saveFailureText: String? {
        switch saveFailure {
        case .noPermission: catalog[.classFormErrorNoPermission]
        case .notSaved: catalog[.classFormErrorNotSaved]
        case nil: nil
        }
    }

    var doubleBookingTitle: String { doubleBooking?.title(catalog) ?? "" }
    var doubleBookingMessage: String { doubleBooking?.message(catalog, format: time.format) ?? "" }
    var doubleBookingBackText: String { catalog[.doubleBookingBack] }
    var doubleBookingSaveAnywayText: String { catalog[.doubleBookingSaveAnyway] }

    /// *Terug*: the warning goes, the form stays as it is and nothing is sent.
    func dismissDoubleBooking() { doubleBooking = nil }

    /// A trainer in the list: the person themself reads *{name} (ik)*.
    func trainerText(_ trainer: Trainer) -> String {
        guard trainer.id == myTrainerID else { return trainer.name }
        return catalog.string(.sessionFormTrainerMe, trainer.name.isEmpty ? (accountName ?? email) : trainer.name)
    }

    /// Something was entered: leaving asks first.
    var isDirty: Bool {
        !(nameNl + nameEn + descriptionNl + descriptionEn).isEmpty || capacity != Self.defaultCapacity
            || time.start != firstStart || time.durationMinutes != Self.defaultMinutes
            || trainerID != (myTrainerID ?? "") || repeatsWeekly
    }

    // MARK: The end

    /// The end: the start plus the length. The length stays when the start moves.
    var end: Date { time.start.addingTimeInterval(TimeInterval(time.durationMinutes * 60)) }

    /// The end the person picked: its time of day, on the day of the start. A time before the start is kept as it is and
    /// refused by the API.
    func setEnd(_ picked: Date) {
        time.durationMinutes = Self.minuteOfDay(picked, in: workspace.timeZone)
            - Self.minuteOfDay(time.start, in: workspace.timeZone)
        refused[.duration] = nil
    }

    private static func minuteOfDay(_ date: Date, in timeZone: TimeZone) -> Int {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        return calendar.component(.hour, from: date) * 60 + calendar.component(.minute, from: date)
    }

    // MARK: Reading

    /// Reads what the form shows around its fields: the default location and the trainers.
    func start() async {
        load = .loading
        sawOffline = false
        do {
            switch try await api.listLocations(.init(path: .init(workspaceId: workspace.id))) {
            case let .ok(found):
                let places = try found.body.json
                guard let place = places.first(where: \.isDefault) ?? places.first else { return load = .failed }
                locationName = place.name
            case .forbidden, .notFound:
                return load = .noPermission
            default:
                return load = .failed
            }
            trainers = try await SessionTeam.readTrainers(api: api, workspaceID: workspace.id)
            myTrainerID = SessionTeam.myTrainerID(trainers: trainers, teamMemberID: workspace.teamMemberId)
            if !trainers.contains(where: { $0.id == trainerID }) { trainerID = myTrainerID ?? "" }
            load = .ready
        } catch let error as SessionLoadError {
            load = error == .gone ? .noPermission : error == .offline ? .offline : .failed
        } catch {
            load = SessionLoadError(thrown: error) == .offline ? .offline : .failed
        }
    }

    func use(_ catalog: Catalog) {
        self.catalog = catalog
        time.use(catalog)
    }

    // MARK: Saving

    /// Creates the class with its date. Returns the date when the API stored it; otherwise nil, with what went wrong in
    /// the form's state. `allowConflicts` is *Toch opslaan* of PS-07: the same request again.
    func save(allowConflicts: Bool = false) async -> Session? {
        guard canSave else { return nil }
        saveFailure = nil
        doubleBooking = nil
        refused = [:]
        time.clearRefusal()
        skippedDate = nil
        isSaving = true
        defer { isSaving = false }
        let body = Components.Schemas.CreateGroupClassRequest(
            nameNl: nameNl.trimmed, nameEn: nameEn.trimmedOrNil, descriptionNl: descriptionNl.trimmedOrNil,
            descriptionEn: descriptionEn.trimmedOrNil, trainerId: trainerID.isEmpty ? nil : trainerID,
            capacity: capacity, durationMinutes: time.durationMinutes, allowConflicts: allowConflicts ? true : nil,
            firstDate: .init(
                localDate: time.localDate, localStart: time.localStart, _repeat: repeatsWeekly ? .weekly : nil
            ),
            surface: .ios
        )
        do {
            let input = Operations.CreateGroupClass.Input(path: .init(workspaceId: workspace.id), body: .json(body))
            switch try await api.createGroupClass(input) {
            case let .created(created):
                let result = try created.body.json
                guard let date = result.firstDate?.value1 else {
                    saveFailure = .notSaved
                    return nil
                }
                datesAdded = result.datesAdded ?? 1
                return date
            case let .badRequest(refusal):
                refuse(try refusal.body.json.issues)
            case let .conflict(conflict):
                doubleBooking = DoubleBooking(
                    conflicts: try conflict.body.json.conflicts, trainerName: chosenTrainerName
                )
            case .forbidden:
                await onForbidden(.class_manage)
                saveFailure = .noPermission
            default:
                saveFailure = .notSaved
            }
        } catch {
            if ClientRequestError(thrown: error) == .offline { sawOffline = true } else { saveFailure = .notSaved }
        }
        return nil
    }

    /// The `400` of the API: each issue names the field it is about.
    private func refuse(_ issues: [Components.Schemas.ValidationError.IssuesPayloadPayload]) {
        let timeRefused = time.refuse(issues)
        skippedDate = issues.first { $0.code == "time_does_not_exist" && $0.path.hasSuffix("localStart") }?.date
        for issue in issues {
            switch issue.path {
            case "nameNl": refused[.nameNl] = issue.code
            case "nameEn": refused[.nameEn] = issue.code
            case "descriptionNl": refused[.descriptionNl] = issue.code
            case "descriptionEn": refused[.descriptionEn] = issue.code
            case "capacity": refused[.capacity] = issue.code
            case "durationMinutes": refused[.duration] = issue.code
            default: break
            }
        }
        if refused.isEmpty, !timeRefused { saveFailure = .notSaved }
    }

    /// The trainer the warning names: nil for the person themself (*Je hebt dan al iets*).
    private var chosenTrainerName: String? {
        guard !trainerID.isEmpty, trainerID != myTrainerID else { return nil }
        return trainers.first { $0.id == trainerID }?.name
    }
}

private extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }

    /// The text, or nil when it is blank: a blank text means none.
    var trimmedOrNil: String? { trimmed.isEmpty ? nil : trimmed }
}

/// *Herhalen* and the refusal of the time (F022).
extension NewGroupClassViewModel {
    var repeatNoneText: String { catalog[.classFormRepeatNone] }

    /// *Elke week op donderdag*: the weekday of the chosen date, as the date shows it.
    var repeatWeeklyText: String { catalog.string(.classFormRepeatWeekly, time.format.weekday(time.start)) }

    /// "We zetten de komende 12 weken in de agenda.", with the weekly choice.
    var repeatNoteText: String? { repeatsWeekly ? catalog[.classFormRepeatNote] : nil }

    /// What the API refused about the date or the start. A start the clocks skip names the date the API found.
    var timeRefusalText: String? {
        guard time.refusal == .timeDoesNotExist else { return time.refusalText }
        let date = skippedDate.flatMap { time.format.day(localDate: $0) } ?? time.format.day(time.start)
        return catalog.string(.classFormErrorTimeDoesNotExist, date)
    }
}

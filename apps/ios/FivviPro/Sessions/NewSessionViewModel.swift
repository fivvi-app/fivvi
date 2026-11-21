import Foundation
import Observation
import FivviAPI
import FivviStrings

/// PS-04 *Nieuwe privésessie* (F020 AC1, AC2, AC10): a client, a date, a start, a length, the trainer, the location and
/// whether the client gets the confirmation. The API plans it (`POST …/sessions/private`) and decides every rule; the
/// form only collects, shows what the API refused and keeps what was typed. Planning needs a connection: when a request
/// couldn't reach the API the form says so and *Opslaan* is off, and nothing is queued; *Opnieuw proberen* reads again.
@MainActor
@Observable
final class NewSessionViewModel: Identifiable {
    typealias Client = Components.Schemas.Client
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

    let id = UUID()
    private(set) var load = Load.loading
    var client: Client?
    var notify = true
    /// The trainer an Owner chose (the team-member ID); a Trainer plans for themself and sends none.
    var trainerID = ""
    let time: SessionTimeFields
    private(set) var trainers: [Trainer] = []
    private(set) var locationName = ""
    private(set) var clientMissing = false
    private(set) var trainerMissing = false
    private(set) var saveFailure: SaveFailure?
    /// PS-07: the API found something else of the trainer's at that time (`409` `trainer_conflict`); nothing was stored.
    private(set) var doubleBooking: DoubleBooking?
    private(set) var isSaving = false
    private(set) var catalog: Catalog
    /// A request failed for lack of a connection. The app has no reachability check (nothing in it has), so a request
    /// that couldn't reach the API is the signal, as in *Klanten*; the next successful read clears it.
    private var sawOffline = false
    let workspace: CurrentWorkspace
    /// The person plans for any trainer of the workspace (`session.private.manage.any`).
    let forAnyTrainer: Bool
    private let api: any APIProtocol
    private let email: String
    private let accountName: String?
    private let firstStart: Date
    private let onForbidden: @MainActor (WorkspaceCapabilities.Capability) async -> Void
    /// The team-member ID of the person among the trainers, once read.
    private(set) var myTrainerID: String?

    init(
        api: any APIProtocol, workspace: CurrentWorkspace, catalog: Catalog, forAnyTrainer: Bool, email: String,
        accountName: String?, now: Date = Date(), start: Date? = nil,
        onForbidden: @escaping @MainActor (WorkspaceCapabilities.Capability) async -> Void = { _ in }
    ) {
        self.api = api
        self.workspace = workspace
        self.catalog = catalog
        self.forAnyTrainer = forAnyTrainer
        self.email = email
        self.accountName = accountName
        self.onForbidden = onForbidden
        firstStart = start ?? SessionClock.nextFullHour(after: now, in: workspace.timeZone)
        time = SessionTimeFields(start: firstStart, durationMinutes: 60, timeZone: workspace.timeZone, catalog: catalog)
    }

    // MARK: Texts

    /// With no connection the form says so, and *Opslaan* is off.
    var isOffline: Bool { load == .offline || sawOffline }
    var canSave: Bool { load == .ready && !isOffline && !isSaving }
    var offlineText: String? { isOffline ? catalog[.sessionFormOffline] : nil }
    var loadFailedText: String { catalog[.sessionFormLoadFailed] }
    var words: TrainerWordForms { TrainerWordForms(workspace.trainerWord, catalog: catalog) }
    var trainerLabel: String { catalog.string(.sessionFormTrainerLabel, words.wordCap) }
    var locationText: String { catalog.string(.sessionFormLocation, locationName) }
    var clientText: String { client?.name ?? catalog[.sessionFormClientPlaceholder] }
    var clientErrorText: String? { clientMissing ? catalog[.sessionErrorsChooseClient] : nil }
    var trainerErrorText: String? { trainerMissing ? catalog.string(.sessionErrorsChooseTrainer, words.aWord) : nil }
    var notifyText: String { catalog.string(.sessionFormNotify, client?.name ?? "") }

    /// *anna@example.com · in het Engels*: where the confirmation goes, and in which language (the client's own, else the
    /// workspace's default).
    var notifyNote: String? {
        guard let client else { return nil }
        let language = client.chosenLocale ?? workspace.defaultLocale
        let text = catalog[language == .en ? .sessionFormLanguageEn : .sessionFormLanguageNl]
        return catalog.string(.sessionFormNotifyNote, client.email, text)
    }

    var saveFailureText: String? {
        switch saveFailure {
        case .noPermission: catalog[.sessionErrorsNoPermission]
        case .notSaved: catalog[.sessionErrorsNotSaved]
        case nil: nil
        }
    }

    var doubleBookingTitle: String { doubleBooking?.title(catalog) ?? "" }
    var doubleBookingMessage: String { doubleBooking?.message(catalog, format: time.format) ?? "" }
    var doubleBookingBackText: String { catalog[.doubleBookingBack] }
    var doubleBookingSaveAnywayText: String { catalog[.doubleBookingSaveAnyway] }

    /// *Terug*: the warning goes, the form stays as it is and nothing is sent.
    func dismissDoubleBooking() { doubleBooking = nil }

    /// The Trainer's own line: their name, marked as them.
    var ownTrainerText: String { catalog.string(.sessionFormTrainerMe, accountName ?? email) }

    /// A trainer in the Owner's list: the person themself reads *{name} (ik)*.
    func trainerText(_ trainer: Trainer) -> String {
        guard trainer.id == myTrainerID else { return trainer.name }
        return catalog.string(.sessionFormTrainerMe, trainer.name.isEmpty ? (accountName ?? email) : trainer.name)
    }

    /// Something was entered: leaving asks first.
    var isDirty: Bool {
        client != nil || time.start != firstStart || time.durationMinutes != 60 || !notify
            || (forAnyTrainer && trainerID != (myTrainerID ?? ""))
    }

    // MARK: Reading

    /// Reads what the form shows around its fields: the default location and, for an Owner, the trainers.
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
            if forAnyTrainer {
                trainers = try await SessionTeam.readTrainers(api: api, workspaceID: workspace.id)
                myTrainerID = SessionTeam.myTrainerID(trainers: trainers, teamMemberID: workspace.teamMemberId)
                if trainerID.isEmpty { trainerID = myTrainerID ?? "" }
            }
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

    /// Plans the session. Returns it when the API saved it; otherwise nil, with what went wrong in the form's state.
    /// `allowConflicts` is *Toch opslaan* of PS-07: the same request again, saved even when the trainer has something then.
    func save(allowConflicts: Bool = false) async -> Session? {
        guard canSave else { return nil }
        saveFailure = nil
        doubleBooking = nil
        time.clearRefusal()
        clientMissing = client == nil
        trainerMissing = forAnyTrainer && trainerID.isEmpty
        guard let client, !trainerMissing else { return nil }
        isSaving = true
        defer { isSaving = false }
        let body = Components.Schemas.PlanPrivateSessionRequest(
            clientId: client.id, trainerId: forAnyTrainer ? trainerID : nil, localDate: time.localDate,
            localStart: time.localStart, durationMinutes: time.durationMinutes, notify: notify,
            allowConflicts: allowConflicts ? true : nil, surface: .ios
        )
        do {
            let input = Operations.CreatePrivateSession.Input(path: .init(workspaceId: workspace.id), body: .json(body))
            switch try await api.createPrivateSession(input) {
            case let .created(created): return try created.body.json.session
            case let .badRequest(refused):
                if !time.refuse(try refused.body.json.issues) { saveFailure = .notSaved }
            case let .conflict(conflict):
                doubleBooking = DoubleBooking(
                    conflicts: try conflict.body.json.conflicts, trainerName: chosenTrainerName
                )
            case .forbidden:
                await onForbidden(.session_private_manage_own)
                saveFailure = .noPermission
            default:
                saveFailure = .notSaved
            }
        } catch {
            if ClientRequestError(thrown: error) == .offline { sawOffline = true } else { saveFailure = .notSaved }
        }
        return nil
    }

    /// The trainer the warning names: nil for the person themself (*Je hebt dan al iets*).
    private var chosenTrainerName: String? {
        guard forAnyTrainer, trainerID != myTrainerID else { return nil }
        return trainers.first { $0.id == trainerID }?.name
    }
}

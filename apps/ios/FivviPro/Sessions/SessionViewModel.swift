import Foundation
import Observation
import FivviAPI
import FivviStrings

/// TD-02 *Privésessie* (F020 AC10, design): the session's title, date and time, where it is with *Route*, the workspace
/// with the trainer (*Jij* for the person looking), and its client. *Verplaatsen*, *Annuleren* (PS-06, F026) and
/// *Klantprofiel* are in the ⋯ menu. A cancelled session shows "Geannuleerd op {date} om {time} door {name}" (with
/// "· op verzoek van de klant" when *De klant* cancelled) and only *Klantprofiel*.
/// Read from `GET …/sessions/{id}` through the generated client; what is shown stays when a later read fails. The
/// sections of later features (workout, last time, notes, attendance) are not shown yet.
@MainActor
@Observable
final class SessionViewModel {
    typealias Session = Components.Schemas.Session

    enum State: Equatable {
        case loading
        case loaded
        case failed
        /// The API refused this session (the team access is gone, or it is not in the workspace).
        case noPermission
    }

    private(set) var state = State.loading
    private(set) var session: Session?
    /// The client's own record, for the language of the change email (PS-05); nil until read, or when it can't be.
    private(set) var clientRecord: Components.Schemas.Client?
    /// A move has just happened: the screen says where the session went.
    private(set) var movedText: String?
    /// The person has just cancelled it: the screen says so, as the web's "Sessie geannuleerd." does.
    private(set) var justCancelled = false
    /// The last read or cancellation couldn't reach the API (the fallback when the phone's network path said online).
    private var requestFailedOffline = false
    private(set) var catalog: Catalog
    let workspace: CurrentWorkspace
    private let sessionID: String
    /// The person has `session.private.cancel.any` (the Owner) or `.own` (a Trainer, for a session of their own).
    private let canCancelAny: Bool
    private let canCancelOwn: Bool
    private let api: any APIProtocol
    /// Whether the phone is online, from the network path (`Connectivity`); a model made without one says online.
    private let isOnline: @MainActor () -> Bool
    /// Told once the session is cancelled, so the lists that show it (Vandaag, Agenda) read again.
    private let onCancelled: @MainActor () -> Void
    private let onForbidden: @MainActor (WorkspaceCapabilities.Capability) async -> Void

    init(
        api: any APIProtocol, workspace: CurrentWorkspace, sessionID: String, catalog: Catalog,
        canCancelAny: Bool = false, canCancelOwn: Bool = false,
        isOnline: @escaping @MainActor () -> Bool = { true },
        onCancelled: @escaping @MainActor () -> Void = {},
        onForbidden: @escaping @MainActor (WorkspaceCapabilities.Capability) async -> Void = { _ in }
    ) {
        self.isOnline = isOnline
        self.onCancelled = onCancelled
        self.canCancelAny = canCancelAny
        self.canCancelOwn = canCancelOwn
        self.api = api
        self.workspace = workspace
        self.sessionID = sessionID
        self.catalog = catalog
        self.onForbidden = onForbidden
    }

    private var timeZone: TimeZone { session.flatMap { TimeZone(identifier: $0.timeZone) } ?? workspace.timeZone }
    private var format: SessionFormat { SessionFormat(locale: catalog.formattingLocale, timeZone: timeZone) }

    // MARK: Texts

    var client: Components.Schemas.SessionParticipant? { session?.participants.first }
    var isCancelled: Bool { session?.status == .cancelled }
    var title: String { catalog.string(.sessionPageHeading, client?.name ?? "") }

    /// "Geannuleerd op do 24 sep om 10:12 door Sarah · op verzoek van de klant"; the plain line when the API sent no
    /// record of the cancellation.
    var cancelledText: String {
        guard let cancellation = session?.cancellation else { return catalog[.sessionPageCancelled] }
        let day = format.day(cancellation.cancelledAt)
        let time = format.time(cancellation.cancelledAt)
        // Placeholders in the order of their names: date, name, time.
        let banner = cancellation.cancelledBy.map {
            catalog.string(.sessionPageCancelledBanner, day, $0.value1.name, time)
        } ?? catalog.string(.sessionPageCancelledBannerUnknown, day, time)
        return cancellation.initiator == .client ? "\(banner) · \(catalog[.sessionPageCancelledByClient])" : banner
    }

    /// "Sessie geannuleerd.", on the screen after the person cancelled it.
    var cancelledDoneText: String? { justCancelled ? catalog[.sessionCancelDone] : nil }
    var clientLabel: String { catalog[.sessionPageClientLabel] }
    var locationName: String { session?.location.name ?? "" }

    /// *donderdag 24 september 2026, 09:00–10:00*
    var whenText: String {
        guard let session else { return "" }
        return catalog.string(
            .sessionPageTimeRange, format.longDay(session.startsAt), format.time(session.endsAt),
            format.time(session.startsAt)
        )
    }

    /// The trainer: *Jij* for the person looking, else the name, or *Geen trainer* once the trainer's profile ended.
    var trainerText: String {
        guard let trainer = session?.trainer else {
            let word = TrainerWordForms(workspace.trainerWord, catalog: catalog).word
            return catalog.string(.sessionPageNoTrainer, word)
        }
        return trainer.id == workspace.teamMemberId ? catalog[.sessionPageYou] : trainer.name
    }

    /// The address as one line, for the maps app; nil when the location has none.
    var routeURL: URL? { LocationRoute.url(session?.location.address) }

    /// The model of PS-05 for this session, or nil while there is none or when it is cancelled (a cancelled session is
    /// not moved).
    func rescheduleForm(now: Date = Date()) -> RescheduleViewModel? {
        guard let session, let client, session.status == .scheduled else { return nil }
        return RescheduleViewModel(
            api: api, workspace: workspace, session: session, clientName: client.name,
            clientLocale: clientRecord?.chosenLocale, catalog: catalog, now: now, onForbidden: onForbidden
        )
    }

    /// The session moved: it shows the new time at once and says where it went.
    func didMove(_ moved: Session, text: String) {
        session = moved
        movedText = text
    }

    /// *Annuleren* is off: the network path says offline, or the last read or cancellation couldn't reach the API.
    var isOffline: Bool { requestFailedOffline || !isOnline() }

    /// *Annuleren* (PS-06) is offered: the session is still planned and the person may cancel it, the Owner any session and
    /// a Trainer their own.
    var canCancel: Bool {
        guard let session, session.status == .scheduled else { return false }
        return canCancelAny || canCancelOwn && session.trainer?.id == workspace.teamMemberId
    }

    /// *Je bent offline. Annuleren kan als je weer verbinding hebt.*, where *Annuleren* is off for lack of a connection.
    var cancelOfflineText: String? { isOffline && canCancel ? catalog[.sessionCancelOffline] : nil }

    /// The model of PS-06 for this session, or nil while there is none or when it can't be cancelled. `canReschedule`:
    /// the person may plan sessions, so the question about another time offers *Verplaatsen*.
    func cancelForm(canReschedule: Bool = true, now: Date = Date()) -> CancelSessionViewModel? {
        guard canCancel, let session, let client else { return nil }
        return CancelSessionViewModel(
            api: api, workspace: workspace, session: session, clientName: client.name, clientEmail: clientRecord?.email,
            clientLocale: clientRecord?.chosenLocale, canReschedule: canReschedule,
            catalog: catalog, now: now, onForbidden: onForbidden
        )
    }

    /// The session is cancelled: it shows the record at once and says so.
    func didCancel(_ cancelled: Session) {
        session = cancelled
        movedText = nil
        justCancelled = true
        requestFailedOffline = false
        onCancelled()
    }

    /// A cancellation couldn't reach the API.
    func cancelWasOffline() { requestFailedOffline = true }

    func use(_ catalog: Catalog) { self.catalog = catalog }

    // MARK: Reading

    func load() async {
        state = .loading
        await read()
    }

    /// Reads the session again and leaves what is on screen until the answer is there.
    func refresh() async {
        await read()
    }

    private func read() async {
        do {
            switch try await api.getSession(.init(path: .init(workspaceId: workspace.id, sessionId: sessionID))) {
            case let .ok(found):
                let fresh = try found.body.json
                if let current = session, current.version != fresh.version { movedText = nil }
                session = fresh
                state = .loaded
                requestFailedOffline = false
            case .forbidden:
                await onForbidden(.clients_view)
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
        await readViewer()
    }

    /// The client's language, only to word the screen, so a failure here changes nothing.
    private func readViewer() async {
        guard clientRecord == nil, let id = client?.clientId else { return }
        let input = Operations.GetClient.Input(path: .init(workspaceId: workspace.id, clientId: id))
        if case let .ok(found)? = try? await api.getClient(input) {
            clientRecord = try? found.body.json
        }
    }

    private func failed() {
        if state != .loaded { state = .failed }
    }
}

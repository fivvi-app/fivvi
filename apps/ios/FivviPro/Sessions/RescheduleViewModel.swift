import Foundation
import Observation
import FivviAPI
import FivviStrings

/// PS-05 *Sessie verplaatsen* (F020 AC6, AC8): a new date, start and length for a private session, and whether the
/// client gets the change by email (on for a session still to come). The button says what happens: *Verplaatsen* or
/// *Verplaatsen en informeren*. The API moves it (`POST …/reschedule`) with the `version` the person saw and decides
/// every rule; when someone else changed the session first (`409`) the form says who and shows the session as it is now.
@MainActor
@Observable
final class RescheduleViewModel: Identifiable {
    typealias Session = Components.Schemas.Session

    /// What a move that didn't happen says.
    enum Failure: Equatable {
        case changed(byName: String?)
        case cancelled
        case noPermission
        case notSaved
    }

    let id = UUID()
    var notify: Bool
    let time: SessionTimeFields
    private(set) var session: Session
    private(set) var failure: Failure?
    private(set) var isSaving = false
    private(set) var catalog: Catalog
    let workspace: CurrentWorkspace
    let clientName: String
    /// The language the client's emails go out in: their own, else the workspace's default.
    private let emailLocale: Components.Schemas.Locale
    private let api: any APIProtocol
    private let onForbidden: @MainActor (WorkspaceCapabilities.Capability) async -> Void

    init(
        api: any APIProtocol, workspace: CurrentWorkspace, session: Session, clientName: String,
        clientLocale: Components.Schemas.Locale?, catalog: Catalog, now: Date = Date(),
        onForbidden: @escaping @MainActor (WorkspaceCapabilities.Capability) async -> Void = { _ in }
    ) {
        self.api = api
        self.workspace = workspace
        self.session = session
        self.clientName = clientName
        emailLocale = clientLocale ?? workspace.defaultLocale
        self.catalog = catalog
        self.onForbidden = onForbidden
        let timeZone = TimeZone(identifier: session.timeZone) ?? workspace.timeZone
        notify = session.startsAt > now
        time = SessionTimeFields(
            start: session.startsAt, durationMinutes: SessionClock.minutes(from: session.startsAt, to: session.endsAt),
            timeZone: timeZone, catalog: catalog
        )
    }

    private var format: SessionFormat { time.format }

    // MARK: Texts

    var subtitle: String { catalog.string(.rescheduleSubtitle, clientName) }

    /// *Nu: 24 sep 2026, 09:00–10:00 · Studio Fit*
    var currentText: String {
        catalog.string(
            .rescheduleCurrent, format.dayYear(session.startsAt), format.time(session.endsAt), session.location.name,
            format.time(session.startsAt)
        )
    }

    var locationText: String { catalog.string(.rescheduleLocationUnchanged, session.location.name) }
    var notifyText: String { catalog.string(.rescheduleNotify, clientName) }

    var notifyNote: String {
        let language = catalog[emailLocale == .en ? .sessionFormLanguageEn : .sessionFormLanguageNl]
        return catalog.string(.rescheduleNotifyNote, clientName, language)
    }

    /// The main button says what happens.
    var submitText: String { catalog[notify ? .rescheduleSubmitNotify : .rescheduleSubmit] }

    var failureText: String? {
        switch failure {
        case let .changed(name):
            name.map { catalog.string(.rescheduleChangedBy, $0) } ?? catalog[.rescheduleChangedByUnknown]
        case .cancelled: catalog[.rescheduleCancelled]
        case .noPermission: catalog[.rescheduleNoPermission]
        case .notSaved: catalog[.sessionErrorsNotSaved]
        case nil: nil
        }
    }

    /// *Verplaatst naar donderdag 24 september om 09:00.*
    func movedText(_ moved: Session) -> String {
        catalog.string(.sessionPageMoved, format.day(moved.startsAt), format.time(moved.startsAt))
    }

    func use(_ catalog: Catalog) {
        self.catalog = catalog
        time.use(catalog)
    }

    // MARK: Moving

    /// Moves the session. Returns it as the API stored it, or nil with what went wrong in the form's state.
    func save() async -> Session? {
        guard !isSaving, session.status == .scheduled else { return nil }
        failure = nil
        time.clearRefusal()
        isSaving = true
        defer { isSaving = false }
        let body = Components.Schemas.ReschedulePrivateSessionRequest(
            localDate: time.localDate, localStart: time.localStart, durationMinutes: time.durationMinutes,
            notify: notify, version: session.version, surface: .ios
        )
        do {
            let input = Operations.ReschedulePrivateSession.Input(
                path: .init(workspaceId: workspace.id, sessionId: session.id), body: .json(body)
            )
            switch try await api.reschedulePrivateSession(input) {
            case let .ok(moved): return try moved.body.json.session
            case let .badRequest(refused):
                if !time.refuse(try refused.body.json.issues) { failure = .notSaved }
            case let .conflict(conflict):
                try reload(from: try conflict.body.json)
            case .forbidden:
                await onForbidden(.session_private_manage_own)
                failure = .noPermission
            default:
                failure = .notSaved
            }
        } catch {
            failure = .notSaved
        }
        return nil
    }

    /// The session was changed first: the form shows it as it is now and the next save uses its version.
    private func reload(from conflict: Components.Schemas.SessionConflict) throws {
        session = conflict.session
        time.start = conflict.session.startsAt
        time.durationMinutes = SessionClock.minutes(from: conflict.session.startsAt, to: conflict.session.endsAt)
        time.durationChoice = SessionTimeFields.chips.contains(time.durationMinutes) ? time.durationMinutes : 0
        failure = conflict.code == .sessionCancelled ? .cancelled : .changed(byName: conflict.changedBy?.name)
    }
}

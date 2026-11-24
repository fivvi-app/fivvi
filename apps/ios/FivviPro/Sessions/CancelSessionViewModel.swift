import Foundation
import Observation
import FivviAPI
import FivviStrings

/// PS-06 *Sessie annuleren?* (F026 AC1, AC1a, AC2, AC4): who is cancelling (*De klant* or *Wij*), whether the client gets
/// an email (off for *De klant*, on for *Wij*, changeable), and, with *De klant* chosen, first the question *Al een ander
/// moment voorgesteld?* with **Verplaatsen** and *Toch annuleren*. The API cancels it (`POST …/cancel`) with the `version`
/// the person saw and decides every rule; a `409` says who changed the session or that it was cancelled already, and the
/// form shows the session as it is now. A session that has started has no email box and sends nothing. Nothing is queued
/// when the phone is offline: the button is off.
@MainActor
@Observable
final class CancelSessionViewModel: Identifiable {
    typealias Session = Components.Schemas.Session

    /// *Wie annuleert?*
    enum Initiator: Equatable {
        case client, workspace
    }

    /// What the dialog shows under the choice: the question about another time, or the confirm step.
    enum Step: Equatable {
        case nudge, confirm
    }

    /// What a cancellation that didn't happen says.
    enum Failure: Equatable {
        case changed(byName: String?)
        case cancelled
        case noPermission
        case notSaved
        case offline
    }

    let id = UUID()
    var notify = false
    private(set) var initiator = Initiator.client
    private(set) var session: Session
    private(set) var failure: Failure?
    private(set) var isSaving = false
    private(set) var catalog: Catalog
    let workspace: CurrentWorkspace
    let clientName: String
    private let clientEmail: String?
    /// The language the client's emails go out in: their own, else the workspace's default.
    private let emailLocale: Components.Schemas.Locale
    /// *Verplaatsen* is on offer: the person may plan sessions.
    private let canReschedule: Bool
    private let now: Date
    /// *Toch annuleren* of the question was chosen.
    private var confirming = false
    private let api: any APIProtocol
    private let onForbidden: @MainActor (WorkspaceCapabilities.Capability) async -> Void

    init(
        api: any APIProtocol, workspace: CurrentWorkspace, session: Session, clientName: String, clientEmail: String?,
        clientLocale: Components.Schemas.Locale?, canReschedule: Bool, catalog: Catalog, now: Date = Date(),
        onForbidden: @escaping @MainActor (WorkspaceCapabilities.Capability) async -> Void = { _ in }
    ) {
        self.api = api
        self.workspace = workspace
        self.session = session
        self.clientName = clientName
        self.clientEmail = clientEmail
        emailLocale = clientLocale ?? workspace.defaultLocale
        self.canReschedule = canReschedule
        self.catalog = catalog
        self.now = now
        self.onForbidden = onForbidden
    }

    private var format: SessionFormat {
        SessionFormat(
            locale: catalog.formattingLocale, timeZone: TimeZone(identifier: session.timeZone) ?? workspace.timeZone
        )
    }

    /// The session has started: the email box is hidden and nothing is sent.
    var started: Bool { session.startsAt <= now }

    /// *Wij* goes straight to the confirm step; so does *Toch annuleren*, and a person who may not move sessions.
    var step: Step { initiator == .workspace || confirming || !canReschedule ? .confirm : .nudge }

    var isOffline: Bool { failure == .offline }

    /// The button works while nothing is being sent, the phone is online and the session can still be cancelled.
    var canSubmit: Bool {
        step == .confirm && !isSaving && failure != .offline && failure != .cancelled && session.status == .scheduled
    }

    // MARK: Texts

    var titleText: String { catalog[.sessionCancelTitle] }

    /// *Anna de Vries · do 24 sep, 09:00–10:00*
    var subtitleText: String {
        // Placeholders in the order of their names: client, date, end, start.
        catalog.string(
            .sessionCancelSubtitle, clientName, format.day(session.startsAt), format.time(session.endsAt),
            format.time(session.startsAt)
        )
    }

    var whoLabelText: String { catalog[.sessionCancelWhoLabel] }
    var whoClientText: String { catalog[.sessionCancelWhoClient] }
    var whoUsText: String { catalog[.sessionCancelWhoUs] }
    var nudgeQuestionText: String { catalog[.sessionCancelNudgeQuestion] }
    var nudgeRescheduleText: String { catalog[.sessionCancelNudgeReschedule] }
    var nudgeCancelAnywayText: String { catalog[.sessionCancelNudgeCancelAnyway] }
    var notifyText: String { catalog.string(.sessionCancelNotify, clientName) }
    var startedText: String { catalog[.sessionCancelStarted] }
    var backText: String { catalog[.sessionCancelBack] }
    var submitText: String { catalog[.sessionCancelSubmit] }

    /// *anna@example.com · in het Engels*; nil when the address isn't known.
    var notifyNote: String? {
        guard let clientEmail else { return nil }
        let language = catalog[emailLocale == .en ? .sessionFormLanguageEn : .sessionFormLanguageNl]
        return catalog.string(.sessionCancelNotifyNote, clientEmail, language)
    }

    var failureText: String? {
        switch failure {
        case let .changed(name):
            name.map { catalog.string(.sessionCancelChangedBy, $0) } ?? catalog[.sessionCancelChangedByUnknown]
        case .cancelled: catalog[.sessionCancelAlreadyCancelled]
        case .noPermission: catalog[.sessionCancelNoPermission]
        case .notSaved: catalog[.sessionErrorsNotSaved]
        case .offline: catalog[.sessionCancelOffline]
        case nil: nil
        }
    }

    func use(_ catalog: Catalog) { self.catalog = catalog }

    // MARK: Choosing

    /// The email box follows who cancels: off for the client's own cancellation, on when we cancel.
    func choose(_ initiator: Initiator) {
        self.initiator = initiator
        notify = initiator == .workspace
        if failure != .offline { failure = nil }
    }

    /// *Toch annuleren* of the question.
    func cancelAnyway() { confirming = true }

    // MARK: Cancelling

    /// Cancels the session. Returns it as the API stored it, or nil with what went wrong in the form's state.
    func cancel() async -> Session? {
        guard !isSaving, session.status == .scheduled else { return nil }
        failure = nil
        isSaving = true
        defer { isSaving = false }
        let body = Components.Schemas.CancelPrivateSessionRequest(
            initiator: initiator == .client ? .client : .workspace,
            // A session that has started sends nothing, whatever the box said.
            notify: notify && !started, version: session.version, surface: .ios
        )
        do {
            let input = Operations.CancelPrivateSession.Input(
                path: .init(workspaceId: workspace.id, sessionId: session.id), body: .json(body)
            )
            switch try await api.cancelPrivateSession(input) {
            case let .ok(cancelled): return try cancelled.body.json.session
            case let .conflict(conflict):
                let refusal = try conflict.body.json
                session = refusal.session.value1
                failure = refusal.code == .sessionCancelled ? .cancelled : .changed(byName: refusal.changedBy?.name)
            case .forbidden:
                await onForbidden(.session_private_cancel_own)
                failure = .noPermission
            default:
                failure = .notSaved
            }
        } catch {
            failure = ClientRequestError(thrown: error) == .offline ? .offline : .notSaved
        }
        return nil
    }
}

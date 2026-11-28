import Foundation
import Network

/// A tiny HTTP server in the UI-test runner that stands in for the API. The app reaches it on the simulator's
/// loopback interface (the Debug build allows plain HTTP), so UI tests can assert what the app requested. It answers
/// the sign-in routes, `POST /api/v1/sign-out`, `GET /api/v1/me` like the API does for one account (`SignIn`) and the
/// client routes (`StubClientRoutes`). A test can also cut the connection (`setOffline`) or hold the sign-in email
/// request to keep the loading state on screen (`holdSignInRequests`).
final class StubServer: Sendable {
    /// A request the app sent: its target, bearer token and JSON body (strings only).
    struct Request: Sendable, Equatable {
        let method: String
        let path: String
        let locale: String?
        let authorization: String?
        let body: [String: String]
    }

    /// The base URL to launch the app with (`-FivviAPIBaseURL`).
    let baseURL: URL
    let signIn: SignIn

    private let listener: NWListener
    private let responder: Responder

    init(signIn: SignIn = SignIn()) throws {
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: .ipv4(.loopback), port: .any)
        let listener = try NWListener(using: parameters)
        let responder = Responder(signIn: signIn)
        let queue = DispatchQueue(label: "app.fivvi.uitests.StubServer")
        let ready = DispatchSemaphore(value: 0)
        listener.stateUpdateHandler = { state in
            switch state {
            case .ready, .failed, .cancelled: ready.signal()
            default: break
            }
        }
        listener.newConnectionHandler = { connection in responder.accept(connection, on: queue) }
        listener.start(queue: queue)
        _ = ready.wait(timeout: .now() + 10)
        guard let port = listener.port, let url = URL(string: "http://127.0.0.1:\(port.rawValue)/api") else {
            listener.cancel()
            throw URLError(.cannotFindHost)
        }
        self.listener = listener
        self.responder = responder
        self.signIn = signIn
        baseURL = url
    }

    deinit {
        listener.cancel()
    }

    /// Every request so far, in order.
    var requests: [Request] { responder.requests }

    /// The requests so far to `path` (e.g. "/api/v1/me").
    func requests(to path: String) -> [Request] { requests.filter { $0.path == path } }

    /// The account loses its team access to workspace number `index` (0 is the first): from now on the API answers
    /// `404` for it and no list has it any more (F003 AC6).
    func removeFromTeam(workspace index: Int) {
        responder.removeFromTeam(workspace: index)
    }

    /// The account's stored language, as `PATCH /api/v1/me` from the app or a change on the web leaves it (F010).
    var preferredLocale: String? {
        get { responder.preferredLocale }
        set { responder.preferredLocale = newValue }
    }

    /// The account's name, as `PATCH /api/v1/me` from the app or a change on the web leaves it (F005).
    var name: String? {
        get { responder.name }
        set { responder.name = newValue }
    }

    /// The word the first workspace uses for its trainers, as a change on the web (Instellingen → Woordkeuze) leaves it:
    /// the next `GET /api/v1/me` and `GET /api/v1/workspaces/{id}` say it (F068).
    var trainerWord: String? {
        get { responder.trainerWord }
        set { responder.trainerWord = newValue }
    }

    /// Whether the Owner's switch of workspace number `index` is on (F005): what `PUT` / `DELETE` left, or what the API
    /// says before: a Trainer trains, an Owner does not.
    func trainsHere(workspace index: Int) -> Bool {
        let role = responder.teamWorkspaceEntries.first { $0.index == index }?.workspace.role
        return responder.trainsOverride(at: index) ?? (role != "owner")
    }

    /// While true, `PUT` / `DELETE` of a trainer profile get no answer, so the saving state stays on screen; setting it
    /// to false answers the calls held.
    func holdTrainerProfileRequests(_ hold: Bool) {
        responder.holdTrainerProfileRequests(hold)
    }

    /// From now on every trainer-profile call is answered with this status and changes nothing; nil answers normally.
    func answerTrainerProfile(withStatus status: Int?) {
        responder.trainerStatus = status
    }

    /// While true, `GET` of one client gets no answer, so the loading state of its profile stays on screen. Setting it to
    /// false answers the reads held.
    func holdClientReads(_ hold: Bool) {
        responder.holdClientReads(hold)
    }

    /// The private session bodies the app sent so far (`POST …/sessions/private`), each value as text (F020).
    var plannedSessions: [[String: String]] { responder.sessionRoutes.plans }

    /// The group class bodies the app sent so far (`POST …/group-classes`), each value as text, the first date as
    /// `firstDate.localDate` and `firstDate.localStart` (F021).
    var createdGroupClasses: [[String: String]] { responder.sessionRoutes.createdGroupClasses }

    /// The reschedule bodies the app sent so far, with the session's ID as `sessionId` (F020).
    var movedSessions: [[String: String]] { responder.sessionRoutes.moves }

    /// The cancel bodies the app sent so far (`POST …/cancel`), each value as text, with the session's ID as `sessionId`
    /// (F026).
    var cancelledSessions: [[String: String]] { responder.sessionRoutes.cancels }

    /// The class-date cancel bodies the app sent so far (`POST …/cancel-class`), like `cancelledSessions` (F026).
    var cancelledClassDates: [[String: String]] { responder.sessionRoutes.classCancels }

    /// The attendance requests the app sent so far, in order (F025): `kind` is `set` or `everyone`; a `set` has `clientId`
    /// and `status`; every one `sessionId`, `clientRequestId` and `surface`.
    var attendanceRequests: [[String: String]] { responder.sessionRoutes.attendanceRequests }

    /// The seven participants of "Kracht" on the seeded class date (F025), *Geboekt* except the ones named by first name in
    /// `statuses` (`no_show`, `attended`, `cancelled`).
    func seedKrachtParticipants(_ statuses: [String: String] = [:]) {
        responder.sessionRoutes.seedKrachtParticipants(statuses)
    }

    /// From when attendance can be taken for the session (F025); an hour ago unless a test says.
    func setAttendanceOpens(_ id: String, at date: Date) {
        responder.sessionRoutes.setAttendanceOpens(id, at: date)
    }

    /// The session has ended: the days say it waits for attendance while a participant is *Geboekt* (F025).
    func setEnded(_ id: String) {
        responder.sessionRoutes.setEnded(id)
    }

    /// The session is cancelled meanwhile, by someone else (F025 AC9).
    func cancelSession(_ id: String) {
        responder.sessionRoutes.cancelSession(id)
    }

    /// The booking link bodies the app sent so far (`POST …/booking-links`), each value as text (F037).
    var bookingLinkRequests: [[String: String]] { responder.sessionRoutes.bookingLinkRequests }

    /// Puts `count` people (at most 3) on the seeded class date, so its cancellation has people to email (F026).
    func bookOnSeededClassDate(_ count: Int) {
        responder.sessionRoutes.bookOnSeededClassDate(count)
    }

    /// The seeded class date (*Kracht*) has this level, or none (*Geen*), as the API sends it (F067).
    func setSeededClassLevel(_ level: String?) {
        responder.sessionRoutes.setSeededLevel(level)
    }

    /// The seeded private session is a colleague's: its trainer is not the signed-in person (F026 AC5).
    func bookSeededSessionWithAnotherTrainer() {
        responder.sessionRoutes.giveSeededSessionToAnotherTrainer()
    }

    /// The next plan or move is refused as a start the clocks skip (`time_does_not_exist`, F020 AC5).
    func refuseNextSessionStart() {
        responder.sessionRoutes.refuseNextStart()
    }

    /// Someone else changed the seeded session meanwhile, so the next move answers `409` (F020 AC8).
    func changeSessionBySomeoneElse() {
        responder.sessionRoutes.changeSessionBySomeoneElse()
    }

    /// What `GET /api/v1/me/day` answers (F013).
    var personalDay: StubPersonalRoutes.Day {
        get { responder.personalRoutes.day }
        set { responder.personalRoutes.day = newValue }
    }

    /// The substitution on the class "Kracht" in My day and My sessions (F024): Mike covers it for Sarah, or took it over.
    var personalSubstitution: StubPersonalRoutes.Substitution? {
        get { responder.personalRoutes.substitution }
        set { responder.personalRoutes.substitution = newValue }
    }

    /// The seeded class date (*Kracht*) has a trainer, and covers for another when `substituteFor` is given (F024).
    func giveSeededClassDateATrainer(
        id: String, name: String, substituteFor: String? = nil
    ) {
        responder.sessionRoutes.giveSeededClassDateATrainer(id: id, name: name, substituteFor: substituteFor)
    }

    /// The level of the class "Kracht" in My day and My sessions (F067): `all_levels`, `beginner`, `intermediate` or
    /// `advanced`; nil is *Geen*.
    var personalClassLevel: String? {
        get { responder.personalRoutes.classLevel }
        set { responder.personalRoutes.classLevel = newValue }
    }

    /// While true, `GET /api/v1/me` gets no answer, so the loading state of the home stays on screen. Setting it to
    /// false answers the reads held.
    func holdAccountRequests(_ hold: Bool) {
        responder.holdAccountReads(hold)
    }

    /// While offline, every request is cut off without an answer, as a lost connection would (it is still recorded in
    /// `requests`).
    func setOffline(_ offline: Bool) {
        responder.setOffline(offline)
    }

    /// While true, `POST /api/v1/sign-in/request` gets no answer, so the loading state stays on screen. Setting it to
    /// false answers the requests held.
    func holdSignInRequests(_ hold: Bool) {
        responder.holdSignInRequests(hold)
    }
}

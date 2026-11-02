import Foundation
import Network

/// A tiny HTTP server in the UI-test runner that stands in for the API. The app reaches it on the simulator's
/// loopback interface (the Debug build allows plain HTTP), so UI tests can assert what the app requested. It answers
/// the hello route as the test says (`Answer`) and the sign-in routes, `POST /api/v1/sign-out` and `GET /api/v1/me`
/// like the API does for one account (`SignIn`). A test can also cut the connection (`setOffline`) or hold the
/// sign-in email request to keep the loading state on screen (`holdSignInRequests`).
final class StubServer: Sendable {
    enum Answer: Sendable {
        /// `200` with this greeting key.
        case greeting(key: String)
        /// An error status without a body.
        case status(Int)
        /// No answer until `answer(with:)` gives one, so the loading state stays on screen.
        case hold
    }

    /// The account the sign-in routes know: its address, the code that works and the token that code is exchanged for.
    struct SignIn: Sendable {
        var email = "owner@example.com"
        var code = "123456"
        var token = "stub-session-token"
        /// The name of the account's one workspace, or nil for none (F002).
        var workspaceName: String? = "John's Gym"
        /// The role in that workspace (`owner` or `trainer`).
        var role = "owner"
        /// More workspaces the account is on the team of, after the first (F003).
        var otherWorkspaces: [Workspace] = []
        /// Whether `GET /api/v1/me` says the account may create a workspace.
        var canCreateWorkspace = false
        /// An error status for `GET /api/v1/me`, or nil to answer as the API does.
        var meStatus: Int?
        /// The account's stored language (`nl-NL` or `en`) at the start, or nil for none (F010).
        var preferredLocale: String?
        /// The account's name at the start, or nil for none (F005).
        var name: String? = "Owner"
    }

    /// A workspace of the account (synthetic).
    struct Workspace: Sendable, Equatable {
        let name: String
        let role: String
    }

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

    init(_ answer: Answer, signIn: SignIn = SignIn()) throws {
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: .ipv4(.loopback), port: .any)
        let listener = try NWListener(using: parameters)
        let responder = Responder(answer, signIn: signIn)
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

    /// The `locale` query parameter of every `GET /api/v1/hello` so far.
    var requestedLocales: [String?] { responder.requestedLocales }

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

    /// Answers from now on, and answers the requests on hold (unless the new answer is `.hold` too).
    func answer(with answer: Answer) {
        responder.answer(with: answer)
    }
}

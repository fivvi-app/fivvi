import Observation
import FivviAPI

/// The signed-in account shown on the home: asks `GET /api/v1/me` through the generated client, which sends the bearer
/// token (`AuthMiddleware`). A `401` is the middleware's business: it signs the app out. It also signs the person out
/// on request (`signOut()`, F001 AC10).
@MainActor
@Observable
final class AccountViewModel {
    enum State: Equatable {
        case loading
        case loaded(email: String)
        /// The API couldn't be reached or didn't answer with the account.
        case failed
    }

    private(set) var state = State.loading
    /// A sign-out is under way: the home shows it and ignores another tap.
    private(set) var isSigningOut = false
    private let api: any APIProtocol
    private let store: any SessionStore
    private let signOutTimeout: Duration
    private let onSignedOut: () -> Void

    /// `signOutTimeout` is how long a sign-out waits for the API before it goes on without an answer.
    init(
        api: any APIProtocol,
        store: any SessionStore,
        signOutTimeout: Duration = .seconds(10),
        onSignedOut: @escaping () -> Void
    ) {
        self.api = api
        self.store = store
        self.signOutTimeout = signOutTimeout
        self.onSignedOut = onSignedOut
    }

    func load() async {
        state = .loading
        do {
            let account = try await api.getMe().ok.body.json
            state = .loaded(email: account.email)
        } catch {
            state = .failed
        }
    }

    /// Ends this phone's sign-in session through the generated client, which sends the token, then deletes the token
    /// and hands over to the sign-in screen. Whatever the answer, and without a connection, the token is deleted: the
    /// person asked to be signed out, and the server's session then ends by itself after 30 days without use. A
    /// connection that hangs is not waited for longer than `signOutTimeout`; the request goes on in the background.
    func signOut() async {
        guard !isSigningOut else { return }
        isSigningOut = true
        let api = api
        // Not a child of the group below, so winning the race with the timer doesn't cancel the request.
        let request = Task { _ = try? await api.signOut() }
        let timeout = signOutTimeout
        await withTaskGroup(of: Void.self) { group in
            group.addTask { await request.value }
            group.addTask { try? await Task.sleep(for: timeout) }
            await group.next()
            group.cancelAll()
        }
        store.deleteToken()
        isSigningOut = false
        onSignedOut()
    }
}

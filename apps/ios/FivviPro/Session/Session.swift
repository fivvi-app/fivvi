import Observation

/// Whether the app is signed in, which decides the screen it opens on (F001 AC13).
@MainActor
@Observable
final class Session {
    enum State: Equatable {
        /// No token. `afterRejection` is true when the API stopped accepting the token, so the sign-in screen says so.
        case signedOut(afterRejection: Bool)
        case signedIn
    }

    private(set) var state: State
    private let store: any SessionStore

    /// The app opens signed in when the store holds a token, otherwise signed out; it makes no authenticated call to
    /// find out (AC13).
    init(store: any SessionStore) {
        self.store = store
        state = store.token == nil ? .signedOut(afterRejection: false) : .signedIn
    }

    /// The token is stored: show the signed-in home.
    func signedIn() {
        state = .signedIn
    }

    /// The person signed out: the token is gone, show the sign-in screen. `afterRejection` is true when the API
    /// refused the token of the sign-out call itself, so the sign-in screen says so, as for any refused token. Does
    /// nothing when the app is already signed out, e.g. because the API rejected the token in the same moment (then
    /// the notice stays).
    func signedOut(afterRejection: Bool = false) {
        guard state == .signedIn else { return }
        state = .signedOut(afterRejection: afterRejection)
    }

    /// The API no longer accepts the token (expired, or the sign-in session ended elsewhere): the token is gone,
    /// show the sign-in screen with the notice.
    func tokenRejected() {
        state = .signedOut(afterRejection: true)
    }
}

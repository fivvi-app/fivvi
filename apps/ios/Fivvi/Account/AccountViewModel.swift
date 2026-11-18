import Foundation
import Observation
import FivviAPI
import FivviLanguage
import FivviSession

/// The signed-in account the tabs of Fivvi show: asks `GET /api/v1/me` through the generated client, which sends the
/// bearer token (`AuthMiddleware`; a `401` is its business: it signs the app out). *Home* and *Boeken* need to know
/// whether to point a trainer to Fivvi Pro, *Profiel* shows the name and the email address. A client belongs to no
/// workspace until F029 and F032, so the no-workspace state is the only one. It also signs the person out on request
/// (`signOut()`, F001 AC10).
@MainActor
@Observable
final class AccountViewModel {
    enum State: Equatable {
        case loading
        /// What the client app shows of the account: the name (the account may have none) and the email address,
        /// read-only, and whether the account is Owner or Trainer of a workspace. Only that flag, no workspace name,
        /// ID or role: the client app shows no team data (E017 AC3).
        case loaded(name: String?, email: String, hasTeamRole: Bool)
        /// The API couldn't be reached or didn't answer with the account.
        case failed
    }

    private(set) var state = State.loading
    /// A sign-out is under way: *Profiel* shows it and ignores another tap.
    private(set) var isSigningOut = false
    private let api: any APIProtocol
    private let store: any SessionStore
    private let clock: any Clock<Duration>
    private let signOutTimeout: Duration
    private let onAccount: (_ id: String) -> Void
    private let onSignedOut: (_ afterRejection: Bool) -> Void
    private let onPreferredLocale: () -> StoredLocaleHandler

    /// `signOutTimeout` is how long a sign-out waits for the API, on `clock`, before it goes on without an answer.
    /// `onAccount` is told the account's ID (a UUID) once `GET /api/v1/me` has answered: the app sets it as the
    /// error-reporting user unless the sign-in has ended meanwhile; `Session` clears it again on sign-out.
    /// `onSignedOut` says whether the API refused the token of the sign-out call.
    init(
        api: any APIProtocol,
        store: any SessionStore,
        clock: any Clock<Duration> = ContinuousClock(),
        signOutTimeout: Duration = SignOutRequest.defaultTimeout,
        onAccount: @escaping (_ id: String) -> Void,
        onSignedOut: @escaping (_ afterRejection: Bool) -> Void,
        onPreferredLocale: @escaping () -> StoredLocaleHandler = { { _ in } }
    ) {
        self.api = api
        self.store = store
        self.clock = clock
        self.signOutTimeout = signOutTimeout
        self.onAccount = onAccount
        self.onSignedOut = onSignedOut
        self.onPreferredLocale = onPreferredLocale
    }

    func load() async {
        state = .loading
        do {
            try await fetch()
        } catch {
            state = .failed
        }
    }

    /// Asks again on opening the app again (foreground): what is on screen stays until the answer is there, and an answer
    /// that fails changes nothing. A team role gained or lost elsewhere shows.
    func refresh() async {
        try? await fetch()
    }

    private func fetch() async throws {
        // Told when the request goes out, so an answer to a read that began before a save can be dropped.
        let storedLocaleRead = onPreferredLocale()
        let account = try await api.getMe().ok.body.json
        // The stored language is told on every answer: a preference changed on the web is adopted (F010 AC2).
        if !Task.isCancelled, store.token != nil {
            storedLocaleRead(account.preferredLocale.flatMap { Components.Schemas.Locale(rawValue: $0.rawValue) })
        }
        state = .loaded(name: account.name, email: account.email, hasTeamRole: !account.workspaces.isEmpty)
        // An answer that arrives after the sign-out (the token is gone) or once the screen has gone (its task is
        // cancelled) must not set the account that was just cleared as the error-reporting user.
        if !Task.isCancelled, store.token != nil { onAccount(account.id) }
    }

    /// Ends this phone's sign-in session. The token is deleted first, so a phone that is switched off or an app that is
    /// killed meanwhile opens signed out; the request goes out with a snapshot of it (`SignOutRequest`). Then the sign-in
    /// screen is shown, whatever the answer and also without a connection (the server's session ends by itself after 30
    /// days without use). A `401` that arrives within the wait shows the notice of a refused token.
    func signOut() async {
        guard !isSigningOut else { return }
        isSigningOut = true
        let token = store.token
        store.deleteToken()
        var rejected = false
        if let token {
            rejected = await SignOutRequest.send(with: token, api: api, clock: clock, timeout: signOutTimeout)
        }
        isSigningOut = false
        onSignedOut(rejected)
    }
}

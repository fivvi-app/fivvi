import Foundation
import Observation
import FivviAPI

/// The signed-in account shown on the home: asks `GET /api/v1/me` through the generated client, which sends the bearer
/// token (`AuthMiddleware`). A `401` is the middleware's business: it signs the app out. It also signs the person out
/// on request (`signOut()`, F001 AC10).
/// Takes the stored preference a `GET /api/v1/me` answered (`AppLanguage.startRead()`).
typealias StoredLocaleHandler = (_ stored: Components.Schemas.Locale?) -> Void

@MainActor
@Observable
final class AccountViewModel {
    enum State: Equatable {
        case loading
        case loaded(email: String)
        /// The API couldn't be reached or didn't answer with the account.
        case failed
    }

    /// What the home shows besides the account line, decided by the API's answer to `GET /api/v1/me` (F002 AC10).
    enum Destination: Equatable {
        /// The account has a workspace: the app's home, with its name.
        case workspace(name: String)
        /// No workspace, but the account may create one: the app says to set it up on the web.
        case setUpOnWeb
        /// No workspace and the account may not create one.
        case noAccess
    }

    private(set) var state = State.loading
    /// Nil until `GET /api/v1/me` has answered with the account. The app holds no rule: the answer's workspaces and
    /// `canCreateWorkspace` decide.
    private(set) var destination: Destination?
    /// A sign-out is under way: the home shows it and ignores another tap.
    private(set) var isSigningOut = false
    /// The workspace the home shows (its ID, name and default communication language), or nil while there is none.
    /// Screens of a workspace (Clients, F006) are built for it.
    var workspace: CurrentWorkspace? { workspaces.current }
    /// What the account may do in each workspace, from the same answer; the app's one helper for showing actions.
    let capabilities = WorkspaceCapabilities()
    /// The current workspace and the last one used on this phone (F012).
    private let workspaces: CurrentWorkspaceStore
    private let api: any APIProtocol
    private let store: any SessionStore
    private let clock: any Clock<Duration>
    private let signOutTimeout: Duration
    private let onAccount: (_ id: String) -> Void
    private let onSignedOut: (_ afterRejection: Bool) -> Void
    private let onPreferredLocale: () -> StoredLocaleHandler

    /// `signOutTimeout` is how long a sign-out waits for the API, on `clock`, before it goes on without an answer.
    /// `onAccount` is told the account's ID (a UUID) once `GET /api/v1/me` has answered: the app sets it as the
    /// error-reporting user (AC2, #266) unless the sign-in has ended meanwhile; `Session` clears it again on sign-out. `onSignedOut` says whether the API
    /// refused the token of the sign-out call.
    init(
        api: any APIProtocol,
        store: any SessionStore,
        clock: any Clock<Duration> = ContinuousClock(),
        signOutTimeout: Duration = .seconds(10),
        onAccount: @escaping (_ id: String) -> Void,
        onSignedOut: @escaping (_ afterRejection: Bool) -> Void,
        onPreferredLocale: @escaping () -> StoredLocaleHandler = { { _ in } },
        workspaces: CurrentWorkspaceStore = CurrentWorkspaceStore()
    ) {
        self.api = api
        self.store = store
        self.clock = clock
        self.signOutTimeout = signOutTimeout
        self.onAccount = onAccount
        self.onSignedOut = onSignedOut
        self.onPreferredLocale = onPreferredLocale
        self.workspaces = workspaces
        capabilities.reload = { [weak self] in await self?.refresh() }
    }

    func load() async {
        state = .loading
        destination = nil
        workspaces.close()
        do {
            try await fetch()
        } catch {
            state = .failed
        }
    }

    /// Asks again on opening the app again (foreground, F003): what is on screen stays until the answer is there, and an
    /// answer that fails changes nothing.
    func refresh() async {
        try? await fetch()
    }

    private func fetch() async throws {
        // Told when the request goes out, so an answer to a read that began before a save can be dropped.
        let storedLocaleRead = onPreferredLocale()
        let account = try await api.getMe().ok.body.json
        // The stored language is told before the workspaces are looked up: a preference changed on the web is adopted
        // even when that lookup fails (F010 AC2).
        if !Task.isCancelled, store.token != nil {
            storedLocaleRead(account.preferredLocale.flatMap { Components.Schemas.Locale(rawValue: $0.rawValue) })
        }
        let (destination, current) = try await destination(of: account)
        state = .loaded(email: account.email)
        self.destination = destination
        if let current { workspaces.open(current) } else { workspaces.close() }
        capabilities.replace(with: account.workspaces, current: current?.id)
        // An answer that arrives after the sign-out (the token is gone) or once the screen has gone (its task is
        // cancelled) must not set the account that was just cleared as the error-reporting user (#266).
        if !Task.isCancelled, store.token != nil { onAccount(account.id) }
    }

    /// Switches the app to the workspace `id` (F012, *Profiel* → *Mijn werkruimtes*): it is remembered on this phone and
    /// read again as the current one, so every screen of a workspace follows. Nothing goes to the server. An `id` the
    /// API did not list for the person does nothing.
    func switchWorkspace(to id: String) async {
        guard id != workspace?.id, capabilities.knows(id) else { return }
        workspaces.remember(id)
        await load()
    }

    /// The last workspace used on this phone decides (`StartWorkspace`), otherwise the first one by name; the first
    /// one in that order the API still lets the person into is the home. A `404` for a workspace means the team access is gone (F003 AC6): the next one is
    /// tried, and with none left the no-access text shows. Any other failure is a failure of the screen, not a verdict.
    /// Also tells which workspace that is, the one the capabilities are read for.
    private func destination(
        of account: Components.Schemas.MeResponse
    ) async throws -> (Destination, workspace: CurrentWorkspace?) {
        for workspace in StartWorkspace.order(account.workspaces, remembered: workspaces.rememberedID) {
            switch try await api.getWorkspace(.init(path: .init(workspaceId: workspace.id))) {
            case let .ok(found):
                let details = try found.body.json
                return (
                    .workspace(name: workspace.name),
                    CurrentWorkspace(
                        id: workspace.id, name: workspace.name, defaultLocale: details.defaultLocale,
                        timeZone: TimeZone(identifier: details.timeZone) ?? CurrentWorkspace.defaultTimeZone
                    )
                )
            case .notFound: continue
            default: throw URLError(.badServerResponse)
            }
        }
        if account.workspaces.isEmpty, account.canCreateWorkspace { return (.setUpOnWeb, nil) }
        return (.noAccess, nil)
    }

    /// Ends this phone's sign-in session. The token is deleted first, so a phone that is switched off or an app that
    /// is killed meanwhile opens signed out; the request goes out with a snapshot of it, through the generated client.
    /// Then the sign-in screen is shown, whatever the answer and also without a connection (the server's session ends
    /// by itself after 30 days without use). A connection that hangs is not waited for longer than `signOutTimeout`;
    /// the request goes on in the background. A `401` that arrives within the wait shows the notice of a refused token.
    func signOut() async {
        guard !isSigningOut else { return }
        isSigningOut = true
        let token = store.token
        store.deleteToken()
        var rejected = false
        if let token { rejected = await sendSignOut(with: token) }
        isSigningOut = false
        onSignedOut(rejected)
    }

    /// Whether the API refused `token`, or false when it said anything else, did not answer or the wait ran out.
    private func sendSignOut(with token: String) async -> Bool {
        let api = api
        let clock = clock
        let timeout = signOutTimeout
        return await withCheckedContinuation { continuation in
            let race = Race(continuation)
            // Neither task is a child of the other: the first to finish ends the wait. An answer cancels the timer;
            // a timer that wins leaves the request running.
            Task {
                let output = await AuthMiddleware.$requestToken.withValue(token) { try? await api.signOut() }
                if case .unauthorized = output { race.finish(true) } else { race.finish(false) }
            }
            race.setTimer(Task {
                guard (try? await clock.sleep(for: timeout)) != nil else { return }
                race.finish(false)
            })
        }
    }
}

/// The workspace the app is showing: what its screens are built for.
struct CurrentWorkspace: Equatable, Sendable {
    let id: String
    let name: String
    /// The workspace's default communication language: the language of a client's emails until one is chosen (ADR-017).
    let defaultLocale: Components.Schemas.Locale
    /// The workspace's time zone: times the app shows for it (the age of an offline list) are in it.
    let timeZone: TimeZone

    /// Europe/Amsterdam, the default of a workspace (`AGENTS.md`).
    static let defaultTimeZone = TimeZone(identifier: "Europe/Amsterdam") ?? .current
}

/// Resumes its continuation with the first answer only and cancels the timer; the request, if it lost, goes on.
private final class Race: @unchecked Sendable {
    private let lock = NSLock()
    private var continuation: CheckedContinuation<Bool, Never>?
    private var timer: Task<Void, Never>?

    init(_ continuation: CheckedContinuation<Bool, Never>) {
        self.continuation = continuation
    }

    func finish(_ rejected: Bool) {
        let (continuation, timer) = lock.withLock {
            defer { self.continuation = nil }
            return (self.continuation, self.timer)
        }
        timer?.cancel()
        continuation?.resume(returning: rejected)
    }

    /// Hands over the timer; if the race is already over it is cancelled at once.
    func setTimer(_ timer: Task<Void, Never>) {
        let over = lock.withLock {
            self.timer = timer
            return continuation == nil
        }
        if over { timer.cancel() }
    }
}

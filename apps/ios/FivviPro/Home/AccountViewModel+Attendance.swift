import FivviAPI
import FivviLanguage
import FivviSession

extension AccountViewModel {
    /// The home's account, tied to its attendance queue (#1618): once `GET /api/v1/me` names the account the queue takes
    /// the taps an earlier sign-in of it left, and the sign-out the person chose (after the warning) empties the queue
    /// the moment it starts, before its request goes out. A token the API rejected signs out elsewhere (`Session`) and
    /// leaves the queue as it is.
    convenience init(
        api: any APIProtocol, store: any SessionStore, queue: AttendanceQueue,
        clock: any Clock<Duration> = ContinuousClock(), signOutTimeout: Duration = SignOutRequest.defaultTimeout,
        onAccount: @escaping (_ id: String) -> Void, onSignedOut: @escaping (_ afterRejection: Bool) -> Void,
        onPreferredLocale: @escaping () -> StoredLocaleHandler = { { _ in } },
        workspaces: CurrentWorkspaceStore = CurrentWorkspaceStore()
    ) {
        self.init(
            api: api, store: store, clock: clock, signOutTimeout: signOutTimeout,
            onAccount: { id in
                queue.learn(account: id)
                onAccount(id)
            },
            onSignedOut: onSignedOut, onSigningOut: { queue.clear() },
            onPreferredLocale: onPreferredLocale, workspaces: workspaces
        )
    }
}

import Foundation

/// The session a UI test starts with. The Keychain outlives the app's launches, so a UI test says whether the app
/// starts signed in or out instead of inheriting what an earlier test left.
public enum UITestSession {
    /// Debug-only launch argument: `-UITestSession none` starts signed out, any other value starts signed in with
    /// that value as the token.
    public static let key = "UITestSession"
    public static let signedOut = "none"

    /// Applies the launch argument, in Debug builds only. `reset` forgets what else the app keeps on the phone between
    /// launches (the language choice, the last workspace): a test starts from a clean phone.
    public static func apply(
        to store: any SessionStore, defaults: UserDefaults = .standard, reset: (UserDefaults) -> Void = { _ in }
    ) {
        #if DEBUG
            guard let value = defaults.string(forKey: key) else { return }
            reset(defaults)
            if value == signedOut {
                store.deleteToken()
            } else {
                try? store.save(token: value)
            }
        #endif
    }
}

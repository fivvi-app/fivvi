import Foundation

/// The session a UI test starts with. The Keychain outlives the app's launches, so a UI test says whether the app
/// starts signed in or out instead of inheriting what an earlier test left.
enum UITestSession {
    /// Debug-only launch argument: `-UITestSession none` starts signed out, any other value starts signed in with
    /// that value as the token.
    static let key = "UITestSession"
    static let signedOut = "none"

    static func apply(to store: any SessionStore, defaults: UserDefaults = .standard) {
        #if DEBUG
            guard let value = defaults.string(forKey: key) else { return }
            if value == signedOut {
                store.deleteToken()
            } else {
                try? store.save(token: value)
            }
        #endif
    }
}

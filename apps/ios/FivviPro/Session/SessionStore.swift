import Foundation
import Security

/// Where the app keeps the bearer token of its sign-in session (F001 AC11). The token lives only here: never in
/// `UserDefaults`, files or logs.
protocol SessionStore: Sendable {
    /// The stored token, or nil when the app is signed out.
    var token: String? { get }
    /// Stores the token, replacing any earlier one.
    func save(token: String) throws
    func deleteToken()
}

enum SessionStoreError: Error, Equatable {
    /// The Keychain refused the token; the status is the `OSStatus` of `SecItemAdd`.
    case keychain(OSStatus)
}

/// The token as a Keychain generic password. It is readable after the first unlock (the app may be opened by a
/// notification or in the background before the phone is unlocked again) and stays on this device: it is neither
/// synced to iCloud Keychain nor restored from a backup onto another phone.
struct KeychainSessionStore: SessionStore {
    static let defaultService = "app.fivvi.pro.session"
    private static let account = "bearerToken"

    private let service: String

    /// `service` separates the items of tests from the app's own.
    init(service: String = Self.defaultService) {
        self.service = service
    }

    private var identity: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: Self.account
        ]
    }

    var token: String? {
        var query = identity
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let data = result as? Data else {
            return nil
        }
        return String(data: data, encoding: .utf8)
    }

    func save(token: String) throws {
        deleteToken()
        var item = identity
        item[kSecValueData as String] = Data(token.utf8)
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(item as CFDictionary, nil)
        guard status == errSecSuccess else { throw SessionStoreError.keychain(status) }
    }

    func deleteToken() {
        SecItemDelete(identity as CFDictionary)
    }
}

extension SessionStore {
    /// `UserDefaults` key that says the app has started before. The defaults are deleted with the app, the Keychain
    /// is not, so a missing key means this is the first launch since the app was installed.
    static var launchedBeforeKey: String { "sessionStoreLaunchedBefore" }

    /// Clears a token left in the Keychain by an earlier install (F001 AC11): the app starts signed out after it was
    /// deleted and installed again. Call it once at launch, before the session is read.
    func clearLeftoverTokenAtFirstLaunch(defaults: UserDefaults = .standard) {
        guard !defaults.bool(forKey: Self.launchedBeforeKey) else { return }
        deleteToken()
        defaults.set(true, forKey: Self.launchedBeforeKey)
    }
}

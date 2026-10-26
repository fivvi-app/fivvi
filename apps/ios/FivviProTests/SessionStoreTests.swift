import Security
import XCTest

@testable import FivviPro

/// The session store against the real Keychain, in a service of its own per test.
final class SessionStoreTests: XCTestCase {
    private func store() -> KeychainSessionStore {
        let service = "app.fivvi.pro.tests.\(UUID().uuidString)"
        let store = KeychainSessionStore(service: service)
        addTeardownBlock { store.deleteToken() }
        return store
    }

    func test_F001N_AC11_savesReadsAndDeletesTheToken() throws {
        let store = store()
        XCTAssertNil(store.token)

        try store.save(token: "first-token")
        XCTAssertEqual(store.token, "first-token")

        try store.save(token: "second-token")
        XCTAssertEqual(store.token, "second-token", "saving again replaces the token")

        store.deleteToken()
        XCTAssertNil(store.token)
        store.deleteToken()
    }

    /// The item is a generic password, readable after the first unlock and bound to this device: not synced to iCloud
    /// Keychain and not restored onto another phone.
    func test_F001N_AC11_keychainThisDeviceOnly() throws {
        let service = "app.fivvi.pro.tests.\(UUID().uuidString)"
        let store = KeychainSessionStore(service: service)
        addTeardownBlock { store.deleteToken() }
        try store.save(token: "device-token")

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrSynchronizable as String: kSecAttrSynchronizableAny,
            kSecReturnAttributes as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: CFTypeRef?
        XCTAssertEqual(SecItemCopyMatching(query as CFDictionary, &result), errSecSuccess)
        let attributes = try XCTUnwrap(result as? [String: Any])

        XCTAssertEqual(
            attributes[kSecAttrAccessible as String] as? String,
            kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly as String
        )
        let synchronizable = attributes[kSecAttrSynchronizable as String] as? Bool
        XCTAssertTrue(synchronizable == nil || synchronizable == false, "the item is not synced to iCloud")
    }

    func test_F001N_AC11_firstLaunchClearsLeftoverToken() throws {
        let store = store()
        let defaults = try emptyDefaults()
        try store.save(token: "left-by-an-earlier-install")

        store.clearLeftoverTokenAtFirstLaunch(defaults: defaults)

        XCTAssertNil(store.token, "a reinstalled app starts signed out")
    }

    func test_F001N_AC11_laterLaunchesKeepTheToken() throws {
        let store = store()
        let defaults = try emptyDefaults()
        store.clearLeftoverTokenAtFirstLaunch(defaults: defaults)
        try store.save(token: "signed-in-since")

        store.clearLeftoverTokenAtFirstLaunch(defaults: defaults)

        XCTAssertEqual(store.token, "signed-in-since")
    }

    func test_F001N_AC11_theTokenIsNotInTheDefaults() throws {
        let store = store()
        let defaults = try emptyDefaults()
        store.clearLeftoverTokenAtFirstLaunch(defaults: defaults)

        try store.save(token: "secret-token")

        let stored = defaults.dictionaryRepresentation().values.map { "\($0)" }
        XCTAssertFalse(stored.contains { $0.contains("secret-token") })
    }
}

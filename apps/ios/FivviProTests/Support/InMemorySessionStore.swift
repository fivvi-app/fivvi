import Foundation

@testable import FivviPro

/// A `SessionStore` that keeps the token in memory, for tests of everything but the Keychain itself.
final class InMemorySessionStore: SessionStore, @unchecked Sendable {
    private let lock = NSLock()
    private var stored: String?
    private var failure: (any Error)?

    init(token: String? = nil) {
        stored = token
    }

    var token: String? { lock.withLock { stored } }

    /// Makes `save(token:)` throw `error`, as a full or locked Keychain would.
    func failSaving(with error: any Error) {
        lock.withLock { failure = error }
    }

    func save(token: String) throws {
        try lock.withLock {
            if let failure { throw failure }
            stored = token
        }
    }

    func deleteToken() {
        lock.withLock { stored = nil }
    }
}

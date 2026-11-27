import CryptoKit
import FivviAPI
import FivviSession
import Foundation

/// Names a sign-in without keeping its token: the first bytes of the token's SHA-256, in hex. A token is new with every
/// sign-in, so the digest tells the attendance queue which sign-in a waiting tap was made in (#1618). It cannot be turned
/// back into the token, which lives only in the Keychain (F001 AC11).
enum SignInFingerprint {
    static func of(_ token: String) -> String {
        SHA256.hash(data: Data(token.utf8)).prefix(16).map { String(format: "%02x", $0) }.joined()
    }
}

extension AttendanceQueue {
    /// The queue of the sign-in `session` holds now: it follows the token, so another sign-in is another sign-in.
    convenience init(
        api: any APIProtocol, store: any PersonalStore, session: any SessionStore,
        isOnline: @escaping @MainActor () -> Bool
    ) {
        self.init(api: api, store: store, isOnline: isOnline, signIn: { session.token.map(SignInFingerprint.of) })
    }
}

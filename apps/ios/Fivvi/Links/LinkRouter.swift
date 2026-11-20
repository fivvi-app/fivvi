import Foundation

/// Where an opened link goes. F029 and F032 register their screens against these; until then both show the placeholder.
enum LinkDestination: Equatable {
    /// The workspace's join link, `https://fivvi.app/j/{code}` (F029).
    case join(code: String)
    /// A client invitation, `https://fivvi.app/i/{token}` (F032).
    case invitation(token: String)
}

/// A link the phone handed to the app: the `url` as opened (for *Openen in de browser*) and where it goes.
struct OpenedLink: Equatable, Identifiable {
    var id: URL { url }
    let url: URL
    let destination: LinkDestination
}

/// The one entry point for links into the app (E017 #505, AC6): `open(_:)` maps `https://fivvi.app/j/{code}` and
/// `https://fivvi.app/i/{token}` to their `LinkDestination` with the code or token passed on, and ignores everything else
/// (other paths, other hosts, other schemes) by answering `nil`. The association file the web serves (`/j/*` and `/i/*`
/// only) decides which links reach the app; this keeps the rule in code, for a link that arrives another way. The same
/// rules as the Android `LinkRouter`.
struct LinkRouter {
    func open(_ url: URL) -> OpenedLink? {
        guard let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
              parts.scheme == "https", parts.host?.lowercased() == Self.host, parts.port == nil,
              parts.percentEncodedUser == nil, parts.percentEncodedPassword == nil
        else { return nil }
        var path = parts.percentEncodedPath
        if path.hasSuffix("/") { path.removeLast() }
        // "/j/ABCD2345" splits into ["", "j", "ABCD2345"]: exactly one value after the kind.
        let segments = path.split(separator: "/", omittingEmptySubsequences: false).map(String.init)
        guard segments.count == 3, segments[0].isEmpty, Self.isCode(segments[2]) else { return nil }
        switch segments[1] {
        case "j": return OpenedLink(url: url, destination: .join(code: segments[2]))
        case "i": return OpenedLink(url: url, destination: .invitation(token: segments[2]))
        default: return nil
        }
    }

    private static let host = "fivvi.app"

    /// A join code is 8 characters of Crockford base32 and an invitation token 43 of base64url; the filter is the common
    /// shape of both, with room to grow.
    private static func isCode(_ value: String) -> Bool {
        (1...64).contains(value.utf8.count)
            && value.utf8.allSatisfy { ($0 >= 0x30 && $0 <= 0x39) || ($0 >= 0x41 && $0 <= 0x5A)
                || ($0 >= 0x61 && $0 <= 0x7A) || $0 == 0x5F || $0 == 0x2D }
    }
}

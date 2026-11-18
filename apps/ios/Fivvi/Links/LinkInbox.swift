import Foundation
import Observation

/// The link the app was opened with, kept until it is shown (E017 #505). A link that arrives while the person is signed
/// out waits here through the sign-in, and the link screen shows once they are in; `dismiss()` returns to the tabs. A
/// cold start from a Universal Link hands the link to the app again, so nothing here is written to disk.
@MainActor
@Observable
final class LinkInbox {
    private let router = LinkRouter()
    private(set) var link: OpenedLink?

    /// Debug-only launch argument: `-UITestOpenLink <url>` opens the app as a Universal Link does, so a UI test needs no
    /// verified association with fivvi.app.
    nonisolated static let launchKey = "UITestOpenLink"

    /// An address the phone opened the app with. Anything the router ignores leaves the current state as it is.
    func open(_ url: URL) {
        if let opened = router.open(url) { link = opened }
    }

    func dismiss() { link = nil }

    /// The inbox of this launch of the app: with the link of a UI test's launch argument in Debug builds, else empty.
    static func forLaunch(defaults: UserDefaults = .standard) -> LinkInbox {
        let inbox = LinkInbox()
        #if DEBUG
            if let address = defaults.string(forKey: launchKey), let url = URL(string: address) { inbox.open(url) }
        #endif
        return inbox
    }
}

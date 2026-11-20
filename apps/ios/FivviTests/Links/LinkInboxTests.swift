import XCTest

@testable import Fivvi

/// E017 #505: a link waits in the inbox through the sign-in, and only a link the router accepts is kept.
@MainActor
final class LinkInboxTests: XCTestCase {
    private func url(_ address: String) -> URL { URL(string: address)! }

    func test_E017_AC6_aJoinLinkIsKeptUntilItIsDismissed() {
        let inbox = LinkInbox()
        XCTAssertNil(inbox.link)

        inbox.open(url("https://fivvi.app/j/ABCD2345"))

        XCTAssertEqual(inbox.link?.destination, .join(code: "ABCD2345"))
        XCTAssertEqual(inbox.link?.url, url("https://fivvi.app/j/ABCD2345"))

        inbox.dismiss()

        XCTAssertNil(inbox.link)
    }

    func test_E017_AC6_aLinkTheRouterIgnoresChangesNothing() {
        let inbox = LinkInbox()
        inbox.open(url("https://fivvi.app/i/tok-1"))

        inbox.open(url("https://fivvi.app/privacy"))
        inbox.open(url("https://example.com/j/ABCD2345"))

        XCTAssertEqual(inbox.link?.destination, .invitation(token: "tok-1"))
    }

    func test_E017_AC6_aLaterLinkReplacesTheEarlierOne() {
        let inbox = LinkInbox()
        inbox.open(url("https://fivvi.app/j/ABCD2345"))

        inbox.open(url("https://fivvi.app/i/tok-1"))

        XCTAssertEqual(inbox.link?.destination, .invitation(token: "tok-1"))
    }

    /// A UI test starts the app with a link, as the phone does when a Universal Link opens it (Debug builds only).
    func test_E017_AC6_aLaunchArgumentOpensALinkInDebugBuilds() throws {
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "LinkInboxTests-\(UUID().uuidString)"))
        defaults.set("https://fivvi.app/j/ABCD2345", forKey: LinkInbox.launchKey)

        let inbox = LinkInbox.forLaunch(defaults: defaults)

        XCTAssertEqual(inbox.link?.destination, .join(code: "ABCD2345"))
        XCTAssertNil(LinkInbox.forLaunch(defaults: UserDefaults(suiteName: "LinkInboxTests-none")!).link)
    }
}

import XCTest

@testable import Fivvi

/// E017 #505, AC6: the join link and the invitation link of fivvi.app open the link screen with the code or token passed
/// on; every other address is ignored. The same cases as the Android `LinkRouterTest`.
final class LinkRouterTests: XCTestCase {
    private let router = LinkRouter()

    private func open(_ address: String) -> OpenedLink? {
        URL(string: address).flatMap(router.open)
    }

    func test_E017_AC6_joinAndInvitationLinksRouteToTheirScreens() {
        XCTAssertEqual(
            open("https://fivvi.app/j/ABCD2345"),
            OpenedLink(url: URL(string: "https://fivvi.app/j/ABCD2345")!, destination: .join(code: "ABCD2345"))
        )
        XCTAssertEqual(
            open("https://fivvi.app/i/tok_4f9-x"),
            OpenedLink(url: URL(string: "https://fivvi.app/i/tok_4f9-x")!, destination: .invitation(token: "tok_4f9-x"))
        )
    }

    func test_E017_AC6_aQueryAFragmentATrailingSlashAndTheHostCaseDoNotChangeTheRoute() {
        XCTAssertEqual(
            open("https://FIVVI.app/j/ABCD2345/?utm_source=qr#top")?.destination, .join(code: "ABCD2345")
        )
    }

    func test_E017_AC6_otherPathsAreIgnored() {
        for address in [
            "https://fivvi.app/",
            "https://fivvi.app/j",
            "https://fivvi.app/j/",
            "https://fivvi.app/i/",
            "https://fivvi.app/j/ABCD2345/extra",
            "https://fivvi.app/J/ABCD2345",
            "https://fivvi.app/jabcd",
            "https://fivvi.app/en/j/ABCD2345",
            "https://fivvi.app/account-verwijderen",
            "https://fivvi.app/api/v1/me",
            "https://fivvi.app/.well-known/apple-app-site-association"
        ] {
            XCTAssertNil(open(address), address)
        }
    }

    func test_E017_AC6_otherHostsAndSchemesAreIgnored() {
        for address in [
            "https://example.com/j/ABCD2345",
            "https://www.fivvi.app/j/ABCD2345",
            "https://fivvi.app.example.com/j/ABCD2345",
            "https://evil.example@fivvi.app/j/ABCD2345",
            "https://fivvi.app@example.com/j/ABCD2345",
            "http://fivvi.app/j/ABCD2345",
            "app.fivvi://j/ABCD2345",
            "https://fivvi.app:8443/j/ABCD2345"
        ] {
            XCTAssertNil(open(address), address)
        }
    }

    // The code is Crockford base32 (8 characters), the invitation token base64url (43 characters): anything else in the
    // last segment is no code or token, so a crafted link never reaches a screen (or the browser button) as one.
    func test_E017_AC6_aCodeOrTokenWithOtherCharactersOrTooLongIsIgnored() {
        for address in [
            "https://fivvi.app/j/AB%20CD",
            "https://fivvi.app/j/AB.CD",
            "https://fivvi.app/j/AB+CD",
            "https://fivvi.app/j/AB%2FCD",
            "https://fivvi.app/j/%3Cscript%3E",
            "https://fivvi.app/i/tok;1",
            "https://fivvi.app/i/\(String(repeating: "a", count: 65))",
            "https://fivvi.app/j/\(String(repeating: "A", count: 65))"
        ] {
            XCTAssertNil(open(address), address)
        }
    }

    func test_E017_AC6_theLongestTokenAndAllAllowedCharactersAreKept() {
        let token = String(repeating: "Az09_-", count: 10) + "abcd"
        XCTAssertEqual(token.count, 64)
        XCTAssertEqual(open("https://fivvi.app/i/\(token)")?.destination, .invitation(token: token))
    }
}

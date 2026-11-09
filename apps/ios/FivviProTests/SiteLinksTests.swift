import FivviAPI
import XCTest

@testable import FivviPro

/// F064 AC17 (spec #611, ticket #646): Profiel links to the privacy policy and to help and contact on the public website,
/// in the language of the app. The test plan runs every test in nl and en (FivviPro.xctestplan).
final class SiteLinksTests: XCTestCase {
    func test_F064_AC17_helpAndContactOpensTheSupportPageInTheLanguageOfTheApp() {
        XCTAssertEqual(SiteLinks.url(.support, .nlNL).absoluteString, "https://fivvi.app/support")
        XCTAssertEqual(SiteLinks.url(.support, .en).absoluteString, "https://fivvi.app/en/support")
    }

    func test_F064_AC17_thePrivacyPolicyOpensThePrivacyPageInTheLanguageOfTheApp() {
        XCTAssertEqual(SiteLinks.url(.privacy, .nlNL).absoluteString, "https://fivvi.app/privacy")
        XCTAssertEqual(SiteLinks.url(.privacy, .en).absoluteString, "https://fivvi.app/en/privacy")
    }

    // The website owns its addresses (`apps/web/site/routes.ts`, copied into this test bundle); a path that changes
    // there must change here.
    func test_F064_AC17_thePathsAreTheOnesTheWebsiteServes() throws {
        let bundle = Bundle(for: Self.self)
        let routes = try XCTUnwrap(
            bundle.url(forResource: "routes", withExtension: "ts"), "routes.ts is not in the test bundle"
        )
        let source = try String(contentsOf: routes, encoding: .utf8)
        for (key, page) in [("support", SitePage.support), ("privacy", SitePage.privacy)] {
            let entry = try XCTUnwrap(Self.entry(key, in: source), "`\(key)` is not in apps/web/site/routes.ts")
            XCTAssertEqual(entry.dutch, SiteLinks.path(page, .nlNL))
            XCTAssertEqual(entry.english, SiteLinks.path(page, .en))
        }
    }

    /// `key: { 'nl-NL': '/path', en: '/en/path' }`, whatever the spacing or line breaks (prettier may reflow it).
    private static func entry(_ key: String, in source: String) -> (dutch: String, english: String)? {
        let space = #"\s*"#
        let pattern = #"\b\#(key)"# + space + ":" + space + #"\{"# + space + #"'nl-NL'"# + space + ":" + space
            + #"'([^']+)'"# + space + "," + space + "en" + space + ":" + space + #"'([^']+)'"# + space + ",?" + space
            + #"\}"#
        guard let regex = try? NSRegularExpression(pattern: pattern),
              let match = regex.firstMatch(in: source, range: NSRange(source.startIndex..., in: source)),
              let dutch = Range(match.range(at: 1), in: source), let english = Range(match.range(at: 2), in: source)
        else { return nil }
        return (String(source[dutch]), String(source[english]))
    }
}

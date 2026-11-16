import FivviAPI
import XCTest

@testable import Fivvi

/// Fivvi is a separate app (E017 AC4): its own bundle ID, its own name under the icon in both languages, its own icon and
/// its own report name for Sentry. Fivvi Pro keeps `app.fivvi.pro`; `scripts/test/app-ids.test.mjs` checks its ID.
final class ClientAppIdentityTests: XCTestCase {
    func test_E017_AC4_theBundleIDIsAppFivvi() {
        XCTAssertEqual(Bundle.main.bundleIdentifier, "app.fivvi")
    }

    /// The name under the icon comes from the generated `InfoPlist.xcstrings` of the client app: *Fivvi* in nl and en, which is
    /// `app.title`, never Fivvi Pro's `app.name`.
    func test_E017_AC4_theNameUnderTheIconIsAppTitleInBothLanguages() throws {
        for language in ["nl", "en"] {
            let path = try XCTUnwrap(
                Bundle.main.path(forResource: "InfoPlist", ofType: "strings", inDirectory: nil, forLocalization: language),
                "no InfoPlist.strings in \(language)"
            )
            let strings = try XCTUnwrap(NSDictionary(contentsOfFile: path) as? [String: String])
            let title = TestCatalog(language == "nl" ? .nlNL : .en)["app.title"]
            XCTAssertEqual(strings["CFBundleDisplayName"], title, language)
            XCTAssertEqual(strings["CFBundleName"], title, language)
            XCTAssertEqual(title, "Fivvi")
        }
    }

    func test_E017_AC4_theAppHasItsOwnIconFromTheAssetCatalog() throws {
        let icons = try XCTUnwrap(Bundle.main.infoDictionary?["CFBundleIcons"] as? [String: Any])
        let primary = try XCTUnwrap(icons["CFBundlePrimaryIcon"] as? [String: Any])
        XCTAssertEqual(primary["CFBundleIconName"] as? String, "AppIcon")
    }

    func test_E017_AC10_theAppReportsToSentryAsFivvi() {
        XCTAssertEqual(Bundle.main.infoDictionary?["FivviSentryApp"] as? String, "fivvi")
    }
}

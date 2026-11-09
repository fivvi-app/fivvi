import FivviAPI
import XCTest

@testable import FivviPro
@testable import FivviStrings

/// F064 AC17 (spec #611, ticket #646): the two rows on *Profiel*, *Hulp en contact* and *Privacyverklaring*, in the
/// order of the prototype, worded from the catalog and pointing at the page of the website in the language shown.
final class ProfileSiteLinkRowsTests: XCTestCase {
    func test_F064_AC17_rowsAreHelpAndContactThenThePrivacyPolicy() {
        for locale in Components.Schemas.Locale.allCases {
            let catalog = TestCatalog(locale)
            let rows = SiteLinkRow.rows(catalog: Catalog(locale: locale))

            XCTAssertEqual(rows.map(\.id), ["profile.support", "profile.privacy"])
            XCTAssertEqual(rows.map(\.title), [catalog["profile.support"], catalog["profile.privacy"]])
            XCTAssertEqual(rows.map(\.url), [SiteLinks.url(.support, locale), SiteLinks.url(.privacy, locale)])
        }
    }

    func test_F064_AC17_theRowsFollowTheLanguageOfTheApp() {
        let dutch = SiteLinkRow.rows(catalog: Catalog(locale: .nlNL)).map(\.url.absoluteString)
        let english = SiteLinkRow.rows(catalog: Catalog(locale: .en)).map(\.url.absoluteString)

        XCTAssertEqual(dutch, ["https://fivvi.app/support", "https://fivvi.app/privacy"])
        XCTAssertEqual(english, ["https://fivvi.app/en/support", "https://fivvi.app/en/privacy"])
    }
}

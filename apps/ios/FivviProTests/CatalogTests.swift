import FivviAPI
import XCTest

@testable import FivviPro

final class CatalogTests: XCTestCase {
    func test_E008_AC1_readsTheCatalogOfTheInterfaceLanguage() {
        for locale in Components.Schemas.Locale.allCases {
            XCTAssertEqual(Catalog(locale: locale).string(forKey: "hello.title"), TestCatalog(locale)["hello.title"])
        }
        XCTAssertNotEqual(
            Catalog(locale: .nlNL).string(forKey: "hello.title"),
            Catalog(locale: .en).string(forKey: "hello.title")
        )
    }

    func test_E008_formatsInTheCatalogsFormattingLocale() {
        XCTAssertEqual(Catalog(locale: .nlNL).formattingLocale.identifier, "nl_NL")
        XCTAssertEqual(Catalog(locale: .en).formattingLocale.identifier, "en_GB", "en formats as en-GB")
    }

    func test_E008_AC4_unknownKeyHasNoText() {
        XCTAssertNil(Catalog(locale: .en).string(forKey: "hello.notAKey"))
    }

    func test_F001N_formatsAStringWithTheAddress() {
        for locale in Components.Schemas.Locale.allCases {
            XCTAssertEqual(
                Catalog(locale: locale).string(.homeSignedInAs, "owner@example.com"),
                String(format: TestCatalog(locale)["home.signedInAs"], "owner@example.com")
            )
        }
    }
}

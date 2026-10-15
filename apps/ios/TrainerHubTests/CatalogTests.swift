import TrainerHubAPI
import XCTest

@testable import TrainerHub

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

    func test_E008_AC4_unknownKeyHasNoText() {
        XCTAssertNil(Catalog(locale: .en).string(forKey: "hello.notAKey"))
    }
}

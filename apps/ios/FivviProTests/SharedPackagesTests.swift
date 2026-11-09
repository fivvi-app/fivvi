import FivviAPI
import FivviStringCatalogs
import XCTest

@testable import FivviPro
@testable import FivviSession
@testable import FivviStrings

/// E017 #500: Fivvi Pro uses the code both iOS apps share through local Swift packages. These tests pin the seams
/// between the app and the packages; what the shared code itself does is covered by the tests of each feature.
final class SharedPackagesTests: XCTestCase {
    func test_E017_AC4_stringCatalogsAreTheResourcesOfTheGeneratedPackage() {
        for locale in Components.Schemas.Locale.allCases {
            XCTAssertNotNil(
                FivviStringCatalogs.bundle.path(forResource: locale.lprojName, ofType: "lproj"),
                "the package FivviStringCatalogs has no \(locale.lprojName).lproj"
            )
        }
    }

    func test_E017_AC4_catalogReadsTheKeysOfTheSharedPackageAndOfTheApp() {
        for locale in Components.Schemas.Locale.allCases {
            let catalog = Catalog(locale: locale)
            let expected = TestCatalog(locale)
            // A key of the shared package and a key the app adds in an extension of `StringKey`.
            XCTAssertEqual(catalog[.commonRetry], expected["common.retry"])
            XCTAssertEqual(catalog[.profileTitle], expected["profile.title"])
        }
    }

    func test_E017_AC4_anAppAddsItsKeysWithoutTouchingThePackage() {
        let key = StringKey("common.retry")
        XCTAssertEqual(key, .commonRetry)
        XCTAssertEqual(StringKey(rawValue: "profile.title"), .profileTitle)
    }

    func test_E017_AC4_uiTestSessionStartsSignedInWithTheArgumentAndResetsWhatTheAppKeeps() throws {
        let defaults = try emptyDefaults()
        let store = InMemorySessionStore()
        defaults.set("token-from-the-test", forKey: UITestSession.key)
        var reset = 0
        UITestSession.apply(to: store, defaults: defaults) { _ in reset += 1 }
        XCTAssertEqual(store.token, "token-from-the-test")
        XCTAssertEqual(reset, 1)
    }

    func test_E017_AC4_uiTestSessionNoneStartsSignedOut() throws {
        let defaults = try emptyDefaults()
        let store = InMemorySessionStore(token: "left-by-an-earlier-test")
        defaults.set(UITestSession.signedOut, forKey: UITestSession.key)
        UITestSession.apply(to: store, defaults: defaults)
        XCTAssertNil(store.token)
    }

    func test_E017_AC4_uiTestSessionWithoutTheArgumentChangesNothing() throws {
        let defaults = try emptyDefaults()
        let store = InMemorySessionStore(token: "kept")
        var reset = 0
        UITestSession.apply(to: store, defaults: defaults) { _ in reset += 1 }
        XCTAssertEqual(store.token, "kept")
        XCTAssertEqual(reset, 0)
    }
}

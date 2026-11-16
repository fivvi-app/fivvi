import FivviSession
import XCTest

@testable import Fivvi

/// What the build configuration gives the app (E017 AC4).
final class AppConfigurationTests: XCTestCase {
    func test_E017_AC4_theKeychainServiceIsTheAppsOwnNotFivviPros() {
        XCTAssertEqual(AppConfiguration.keychainService, "app.fivvi.session")
        XCTAssertNotEqual(AppConfiguration.keychainService, KeychainSessionStore.defaultService)
    }

    func test_E017_AC4_theAppReadsItsApiAddressFromItsInfoPlist() throws {
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "AppConfigurationTests"))
        defaults.removePersistentDomain(forName: "AppConfigurationTests")

        let url = AppConfiguration.apiBaseURL(info: ["FivviAPIBaseURL": "https://api.example.com/api"], defaults: defaults)

        XCTAssertEqual(url.absoluteString, "https://api.example.com/api")
    }

    func test_E017_AC4_aDebugLaunchArgumentOverridesTheApiAddress() throws {
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "AppConfigurationTests.override"))
        defaults.removePersistentDomain(forName: "AppConfigurationTests.override")
        defaults.set("http://127.0.0.1:5000/api", forKey: AppConfiguration.apiBaseURLKey)

        let url = AppConfiguration.apiBaseURL(info: ["FivviAPIBaseURL": "https://api.example.com/api"], defaults: defaults)

        XCTAssertEqual(url.absoluteString, "http://127.0.0.1:5000/api")
    }

    func test_E017_AC1_profielShowsTheVersionOfTheBuild() {
        XCTAssertEqual(AppConfiguration.version(info: ["CFBundleShortVersionString": "1.2.3"]), "1.2.3")
        XCTAssertEqual(AppConfiguration.version(info: nil), "")
    }
}

import TrainerHubAPI
import XCTest

@testable import TrainerHub

/// The build configuration the tests run in (Debug) and what the app reads from it.
final class AppConfigurationTests: XCTestCase {
    func test_E008_AC8_displayNameComesFromTheCatalog() {
        let language: Components.Schemas.Locale = Bundle.main.preferredLocalizations.first == "nl" ? .nlNL : .en
        let displayName = Bundle.main.localizedInfoDictionary?["CFBundleDisplayName"] as? String

        XCTAssertEqual(displayName, TestCatalog(language)["app.name"])
    }

    func test_E008_debugUsesTheLocalDevServerOverPlainHTTP() throws {
        let url = AppConfiguration.apiBaseURL(info: Bundle.main.infoDictionary, defaults: try emptyDefaults())

        XCTAssertEqual(url.scheme, "http")
        XCTAssertEqual(url.host(), "localhost")
        XCTAssertEqual(url.path(), "/api")
        let transportSecurity = Bundle.main.infoDictionary?["NSAppTransportSecurity"] as? [String: Any]
        XCTAssertEqual(transportSecurity?["NSAllowsArbitraryLoads"] as? Bool, true)
    }

    func test_E008_debugBaseURLCanBeOverriddenAtLaunch() throws {
        let defaults = try emptyDefaults()
        defaults.set("https://preview.example.com/api", forKey: AppConfiguration.apiBaseURLKey)

        let url = AppConfiguration.apiBaseURL(info: Bundle.main.infoDictionary, defaults: defaults)

        XCTAssertEqual(url, URL(string: "https://preview.example.com/api"))
    }

    private func emptyDefaults() throws -> UserDefaults {
        let suite = "nl.trainerhub.app.tests.\(UUID().uuidString)"
        addTeardownBlock { UserDefaults().removePersistentDomain(forName: suite) }
        return try XCTUnwrap(UserDefaults(suiteName: suite))
    }
}

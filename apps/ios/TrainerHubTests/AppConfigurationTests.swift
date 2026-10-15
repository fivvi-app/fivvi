import TrainerHubAPI
import XCTest

@testable import TrainerHub

/// The build configuration the tests run in (Debug) and what the app reads from it.
final class AppConfigurationTests: XCTestCase {
    func test_E008_AC8_displayNameComesFromTheCatalog() {
        let displayName = Bundle.main.localizedInfoDictionary?["CFBundleDisplayName"] as? String

        XCTAssertEqual(displayName, TestCatalog(TestCatalog.configuredLocale)["app.name"])
    }

    /// The committed default is the local dev server (scripts/test-ios.sh checks Config/Debug.xcconfig); a developer's
    /// Config/Local.xcconfig may point it at a preview or a Mac on the LAN, so this asserts what holds for all of them.
    func test_E008_debugAllowsPlainHTTPToLocalHostsOnly() throws {
        let info = Bundle.main.object(forInfoDictionaryKey: AppConfiguration.apiBaseURLKey)
        let configured = try XCTUnwrap(info as? String)
        let url = AppConfiguration.apiBaseURL(info: Bundle.main.infoDictionary, defaults: try emptyDefaults())

        XCTAssertEqual(url, URL(string: configured), "the base URL comes from the build configuration")
        XCTAssertEqual(url.path(), "/api")
        let transportSecurity = try XCTUnwrap(Bundle.main.infoDictionary?["NSAppTransportSecurity"] as? [String: Any])
        XCTAssertEqual(transportSecurity as NSDictionary, ["NSAllowsLocalNetworking": true], "local networking only")
        if url.scheme == "http" {
            XCTAssertTrue(isLocal(try XCTUnwrap(url.host())), "plain HTTP only to a local host, not \(url)")
        } else {
            XCTAssertEqual(url.scheme, "https")
        }
    }

    func test_E008_debugBaseURLCanBeOverriddenAtLaunch() throws {
        let defaults = try emptyDefaults()
        defaults.set("https://preview.example.com/api", forKey: AppConfiguration.apiBaseURLKey)

        let url = AppConfiguration.apiBaseURL(info: Bundle.main.infoDictionary, defaults: defaults)

        XCTAssertEqual(url, URL(string: "https://preview.example.com/api"))
    }

    /// A host on this Mac or the LAN: an unqualified name (`localhost`), a `.local` name, or a loopback, private or
    /// link-local IP address. A public host must use HTTPS.
    private func isLocal(_ host: String) -> Bool {
        if !host.contains(".") && !host.contains(":") || host.hasSuffix(".local") { return true }
        if host == "::1" || host.lowercased().hasPrefix("fe80:") || host.lowercased().hasPrefix("fd") { return true }
        let octets = host.split(separator: ".").compactMap { Int($0) }
        guard octets.count == 4 else { return false }
        switch (octets[0], octets[1]) {
        case (10, _), (127, _), (192, 168), (169, 254), (172, 16...31): return true
        default: return false
        }
    }

    private func emptyDefaults() throws -> UserDefaults {
        let suite = "nl.trainerhub.app.tests.\(UUID().uuidString)"
        addTeardownBlock { UserDefaults().removePersistentDomain(forName: suite) }
        return try XCTUnwrap(UserDefaults(suiteName: suite))
    }
}

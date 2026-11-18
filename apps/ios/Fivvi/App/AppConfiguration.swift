import Foundation

/// Settings that differ per build configuration (Config/*.xcconfig), the same for the client app as for Fivvi Pro.
enum AppConfiguration {
    /// Info.plist key that holds the API base URL of the build configuration.
    static let apiBaseURLKey = "FivviAPIBaseURL"

    /// The Keychain service of this app's bearer token: its own, never Fivvi Pro's, so the two apps never read each
    /// other's token.
    static let keychainService = "app.fivvi.session"

    /// The API's base URL, including the `/api` mount. Debug builds also take a launch argument
    /// (`-FivviAPIBaseURL <url>`), which the UI tests use for their stub server.
    static func apiBaseURL(
        info: [String: Any]? = Bundle.main.infoDictionary,
        defaults: UserDefaults = .standard
    ) -> URL {
        #if DEBUG
            if let override = defaults.string(forKey: apiBaseURLKey), let url = URL(string: override) {
                return url
            }
        #endif
        guard let value = info?[apiBaseURLKey] as? String, let url = URL(string: value), url.host() != nil else {
            preconditionFailure("\(apiBaseURLKey) in Info.plist is not a URL; set FIVVI_API_BASE_URL in Config/")
        }
        return url
    }

    /// The version the app shows on *Profiel*: `MARKETING_VERSION`, which both apps and Android take from
    /// apps/Version.xcconfig.
    static func version(info: [String: Any]? = Bundle.main.infoDictionary) -> String {
        info?["CFBundleShortVersionString"] as? String ?? ""
    }
}

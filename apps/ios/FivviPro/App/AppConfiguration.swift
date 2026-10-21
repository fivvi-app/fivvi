import Foundation

/// Settings that differ per build configuration (Config/*.xcconfig).
enum AppConfiguration {
    /// Info.plist key that holds the API base URL of the build configuration.
    static let apiBaseURLKey = "FivviAPIBaseURL"

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
}

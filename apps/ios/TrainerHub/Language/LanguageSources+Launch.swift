import Foundation

extension LanguageSources {
    /// The sources this launch of the app uses.
    static func forLaunch(defaults: UserDefaults = .standard) -> LanguageSources {
        var sources = LanguageSources.system(defaults: defaults)
        #if DEBUG
            // UI tests can't change the per-app language in iOS Settings, so they pass it as a launch argument.
            if let perApp = defaults.string(forKey: "UITestPerAppLanguage") {
                sources.perApp = perApp
            }
        #endif
        return sources
    }
}

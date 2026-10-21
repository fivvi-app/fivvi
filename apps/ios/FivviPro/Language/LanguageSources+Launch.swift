import Foundation

extension LanguageSources {
    /// Debug-only launch argument with the per-app language, for UI tests (`-UITestPerAppLanguage nl`).
    static let uiTestPerAppLanguageKey = "UITestPerAppLanguage"

    /// The sources this launch of the app uses.
    static func forLaunch(defaults: UserDefaults = .standard) -> LanguageSources {
        var sources = LanguageSources.system(defaults: defaults)
        #if DEBUG
            // UI tests can't change the per-app language in iOS Settings, so they pass it as a launch argument.
            if let perApp = defaults.string(forKey: uiTestPerAppLanguageKey) {
                sources.perApp = perApp
            }
        #endif
        return sources
    }
}

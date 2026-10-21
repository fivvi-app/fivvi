import Foundation

extension LanguageSources {
    /// The sources on this device. iOS stores the per-app language from Settings as `AppleLanguages` in the app's own
    /// defaults domain; `Locale.preferredLanguages` is the device's list.
    static func system(
        defaults: UserDefaults = .standard,
        appDomain: String = Bundle.main.bundleIdentifier ?? "",
        device: [String] = Locale.preferredLanguages
    ) -> LanguageSources {
        let perApp = defaults.persistentDomain(forName: appDomain)?["AppleLanguages"] as? [String]
        return LanguageSources(perApp: perApp?.first, device: device)
    }
}

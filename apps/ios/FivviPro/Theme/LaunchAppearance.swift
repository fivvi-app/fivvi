import SwiftUI

/// The app's light or dark mode at launch: the system's, which every token colour follows. Debug builds also take a
/// launch argument for UI tests (`-UITestAppearance dark`), because `XCUIDevice.appearance` doesn't switch every
/// simulator.
enum LaunchAppearance {
    /// Debug-only launch argument with the appearance, "light" or "dark".
    static let uiTestAppearanceKey = "UITestAppearance"

    /// The colour scheme a UI test asked for, or nil to follow the system.
    static func colorScheme(defaults: UserDefaults = .standard) -> ColorScheme? {
        #if DEBUG
            switch defaults.string(forKey: uiTestAppearanceKey) {
            case "dark": return .dark
            case "light": return .light
            default: return nil
            }
        #else
            return nil
        #endif
    }
}

import Foundation

/// The clock the personal screens read. A Debug build takes `-UITestNow <ISO 8601 instant>`, which fixes it, so a UI test
/// can say it is 08:35 on 22 September 2026 and read "Straks · over 25 min" whatever the real time is.
enum UITestClock {
    static let key = "UITestNow"

    static func provider(defaults: UserDefaults = .standard) -> () -> Date {
        #if DEBUG
            if let text = defaults.string(forKey: key), let fixed = ISO8601DateFormatter().date(from: text) {
                return { fixed }
            }
        #endif
        return { Date() }
    }
}

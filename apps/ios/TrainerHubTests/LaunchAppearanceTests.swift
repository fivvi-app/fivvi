import SwiftUI
import XCTest

@testable import TrainerHub

/// The app's light or dark mode: the system's, unless a Debug UI test sets it at launch.
final class LaunchAppearanceTests: XCTestCase {
    func test_E008_AC6_followsTheSystemAppearance() throws {
        XCTAssertNil(Bundle.main.object(forInfoDictionaryKey: "UIUserInterfaceStyle"), "no fixed appearance")
        XCTAssertNil(LaunchAppearance.colorScheme(defaults: try emptyDefaults()))
    }

    func test_E008_AC6_uiTestsSetTheAppearanceAtLaunch() throws {
        for (value, expected) in [("dark", ColorScheme.dark), ("light", .light), ("sepia", nil)] {
            let defaults = try emptyDefaults()
            defaults.set(value, forKey: LaunchAppearance.uiTestAppearanceKey)

            XCTAssertEqual(LaunchAppearance.colorScheme(defaults: defaults), expected, value)
        }
    }
}

import XCTest

/// The Debug-only kit gallery in a launched app (`KitGallery` in the app): the kit's building blocks inside the
/// system's tab bar and navigation bar. Elements are found by accessibility identifier, never by visible text.
@MainActor
struct KitGalleryScreen {
    let app: XCUIApplication
    let catalog: TestCatalog

    var tabBar: XCUIElement { app.tabBars.firstMatch }
    var title: XCUIElement { app.staticTexts["largeTitle.title"] }
    var eyebrow: XCUIElement { app.staticTexts["largeTitle.eyebrow"] }
    var sheetButton: XCUIElement { app.buttons["kit.sheetButton"] }
    var alertButton: XCUIElement { app.buttons["kit.alertButton"] }
    var sheet: XCUIElement { app.staticTexts["kit.sheet"] }
    var pill: XCUIElement { app.buttons["kit.pill"] }
    var stackFirst: XCUIElement { app.buttons["kit.stack.first"] }
    var stackSecond: XCUIElement { app.buttons["kit.stack.second"] }
    var stackThird: XCUIElement { app.buttons["kit.stack.third"] }
    var fieldError: XCUIElement { app.staticTexts["field.error"] }
    var toastText: XCUIElement { app.staticTexts["toast.text"] }
    var toastIcon: XCUIElement { app.images["toast.icon"] }
    var scroll: XCUIElement { app.scrollViews.firstMatch }

    /// Launches the Debug app on the gallery, in the test-plan configuration's language and, when given, an appearance
    /// ("light" or "dark").
    static func launch(appearance: String? = nil) -> KitGalleryScreen {
        let app = XCUIApplication()
        let language = TestCatalog.configuredLanguage
        app.launchArguments = ["-AppleLanguages", "(\"\(language)\")", "-UITestKitGallery", "YES"]
        if let appearance { app.launchArguments += ["-UITestAppearance", appearance] }
        app.launchEnvironment["TZ"] = "Europe/Amsterdam"
        ReachableLaunch.launch(app)
        return KitGalleryScreen(app: app, catalog: TestCatalog(language))
    }

    /// Scrolls the gallery up until `element` can be tapped, at most `swipes` times.
    func scroll(to element: XCUIElement, swipes: Int = 12) {
        for _ in 0..<swipes where !(element.exists && element.isHittable) {
            scroll.swipeUp(velocity: .slow)
        }
    }
}

import XCTest

/// The Debug-only kit gallery in a launched app (`KitGallery` in the app): the kit's building blocks inside the
/// system's tab bar and navigation bar. Elements are found by accessibility identifier, never by visible text.
@MainActor
struct KitGalleryScreen {
    let app: XCUIApplication
    let catalog: TestCatalog
    /// When the app was launched.
    let launched: Date

    var tabBar: XCUIElement { app.tabBars.firstMatch }
    var title: XCUIElement { app.staticTexts["largeTitle.title"] }
    var eyebrow: XCUIElement { app.staticTexts["largeTitle.eyebrow"] }
    var sheetButton: XCUIElement { app.buttons["kit.sheetButton"] }
    var alertButton: XCUIElement { app.buttons["kit.alertButton"] }
    var sheet: XCUIElement { app.staticTexts["kit.sheet"] }
    var stackSecond: XCUIElement { app.buttons["kit.stack.second"] }
    var invalidField: XCUIElement { app.textFields["kit.field.invalid"] }
    var validField: XCUIElement { app.textFields["kit.field.valid"] }
    var roundProminent: XCUIElement { app.buttons["kit.round.prominent"] }
    var roundRegular: XCUIElement { app.buttons["kit.round.regular"] }
    var roundTaps: XCUIElement { app.staticTexts["kit.round.taps"] }
    var toastText: XCUIElement { app.staticTexts["toast.text"] }
    var scroll: XCUIElement { app.scrollViews.firstMatch }
    /// The plain list of the other tab (a collection view to the accessibility tree).
    var plainList: XCUIElement { app.collectionViews.firstMatch }

    /// Launches the Debug app on the gallery, in the test-plan configuration's language.
    static func launch() -> KitGalleryScreen {
        let app = XCUIApplication()
        let language = TestCatalog.configuredLanguage
        app.launchArguments = [
            "-AppleLanguages", "(\"\(language)\")", "-UITestKitGallery", "YES", "-UITestAppearance", "light"
        ]
        app.launchEnvironment["TZ"] = "Europe/Amsterdam"
        let launchedAt = Date.now
        ReachableLaunch.launch(app)
        return KitGalleryScreen(app: app, catalog: TestCatalog(language), launched: launchedAt)
    }

    /// What the date above the title can read: today in the app's language and Europe/Amsterdam, taken before and
    /// after the check so a test running over midnight still passes.
    var dates: [String] {
        let amsterdam = TimeZone(identifier: "Europe/Amsterdam") ?? .gmt
        let language = TestCatalog.configuredLanguage
        let locale = Locale(identifier: language == "nl" ? "nl_NL" : "en_GB")
        let style = Date.FormatStyle(locale: locale, timeZone: amsterdam).weekday(.wide).day().month(.wide)
        return [launched, .now].map { $0.formatted(style) }
    }

    /// Scrolls the gallery up until `element` can be tapped, at most `swipes` times.
    func scroll(to element: XCUIElement, swipes: Int = 12) {
        for _ in 0..<swipes where !(element.exists && element.isHittable) {
            scroll.swipeUp(velocity: .slow)
        }
    }

    /// Scrolls the gallery up until `element` is in the upper half of the window, clear of the tab bar, the toast and
    /// the keyboard at the bottom, at most `swipes` times.
    func scroll(toUpperHalf element: XCUIElement, swipes: Int = 12) {
        let half = app.windows.firstMatch.frame.height / 2
        for _ in 0..<swipes where !(element.exists && element.isHittable && element.frame.midY < half) {
            scroll.swipeUp(velocity: .slow)
        }
    }

    /// Scrolls the gallery back down the page (the content moves down) until `element` can be tapped, at most `swipes`
    /// times.
    func scrollBack(to element: XCUIElement, swipes: Int = 12) {
        for _ in 0..<swipes where !(element.exists && element.isHittable) {
            scroll.swipeDown(velocity: .slow)
        }
    }
}

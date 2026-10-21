import XCTest

/// The hello screen in a launched app. Elements are found by accessibility identifier, never by visible text; the
/// Android app uses the same values as test tags (Maestro, #34).
@MainActor
struct HelloScreen {
    let app: XCUIApplication

    var greeting: XCUIElement { app.staticTexts["hello.greeting"] }
    var loading: XCUIElement { app.activityIndicators["hello.loading"] }
    var error: XCUIElement { app.staticTexts["hello.error"] }
    var retry: XCUIElement { app.buttons["hello.retry"] }

    /// Launches the app against `server`.
    /// - Parameters:
    ///   - deviceLanguages: the device's preferred languages; the test-plan configuration's language when nil.
    ///   - perAppLanguage: the per-app language from iOS Settings, which UI tests can't set there, so the Debug app
    ///     takes it as a launch argument (`LanguageSources.uiTestPerAppLanguageKey` in the app).
    ///   - textSize: a `UIContentSizeCategory` raw value, e.g. `UICTContentSizeCategoryAccessibilityXXXL`.
    ///   - appearance: "light" or "dark", which the Debug app takes as a launch argument
    ///     (`LaunchAppearance.uiTestAppearanceKey` in the app); the simulator's own appearance when nil.
    static func launch(
        against server: StubServer,
        deviceLanguages: [String]? = nil,
        perAppLanguage: String? = nil,
        textSize: String? = nil,
        appearance: String? = nil
    ) -> HelloScreen {
        let app = XCUIApplication()
        let languages = deviceLanguages ?? [TestCatalog.configuredLanguage]
        app.launchArguments = [
            "-AppleLanguages", "(" + languages.map { "\"\($0)\"" }.joined(separator: ", ") + ")",
            "-FivviAPIBaseURL", server.baseURL.absoluteString
        ]
        if let perAppLanguage {
            app.launchArguments += ["-UITestPerAppLanguage", perAppLanguage]
        }
        if let textSize {
            app.launchArguments += ["-UIPreferredContentSizeCategoryName", textSize]
        }
        if let appearance {
            app.launchArguments += ["-UITestAppearance", appearance]
        }
        app.launchEnvironment["TZ"] = "Europe/Amsterdam"
        app.launch()
        return HelloScreen(app: app)
    }
}

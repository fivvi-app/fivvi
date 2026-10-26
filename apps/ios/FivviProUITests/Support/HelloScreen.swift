import XCTest

/// The hello screen in a launched app (on the signed-in home). Elements are found by accessibility identifier, never by visible text; the
/// Android app uses the same values as test tags (Maestro, #34).
@MainActor
struct HelloScreen {
    let app: XCUIApplication

    var greeting: XCUIElement { app.staticTexts["hello.greeting"] }
    var loading: XCUIElement { app.activityIndicators["hello.loading"] }
    var error: XCUIElement { app.staticTexts["hello.error"] }
    var retry: XCUIElement { app.buttons["hello.retry"] }

    /// Launches the app against `server`, signed in (the hello screen is part of the signed-in home); the parameters
    /// are `AppLaunch.launch`'s.
    static func launch(
        against server: StubServer,
        deviceLanguages: [String]? = nil,
        perAppLanguage: String? = nil,
        textSize: String? = nil,
        appearance: String? = nil
    ) -> HelloScreen {
        HelloScreen(app: AppLaunch.launch(
            against: server, session: .signedIn, deviceLanguages: deviceLanguages, perAppLanguage: perAppLanguage,
            textSize: textSize, appearance: appearance
        ))
    }
}

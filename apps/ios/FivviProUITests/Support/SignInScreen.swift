import XCTest

/// TM-01 and the signed-in home in a launched app. Elements are found by accessibility identifier, never by visible
/// text; the Android app uses the same values as test tags (Maestro).
@MainActor
struct SignInScreen {
    let app: XCUIApplication

    var title: XCUIElement { app.staticTexts["signIn.title"] }
    var notice: XCUIElement { app.staticTexts["signIn.notice"] }
    var email: XCUIElement { app.textFields["signIn.email"] }
    var sendCode: XCUIElement { app.buttons["signIn.send"] }
    var checkEmail: XCUIElement { app.staticTexts["signIn.checkEmail"] }
    var code: XCUIElement { app.textFields["signIn.code"] }
    var submit: XCUIElement { app.buttons["signIn.submit"] }
    var error: XCUIElement { app.staticTexts["signIn.error"] }
    var loading: XCUIElement { app.activityIndicators["signIn.loading"] }
    /// On the signed-in home: the account line, and the hello greeting the home keeps.
    var signedInAs: XCUIElement { app.staticTexts["home.signedInAs"] }
    var greeting: XCUIElement { app.staticTexts["hello.greeting"] }

    /// Launches the app against `server`; the parameters are `AppLaunch.launch`'s.
    static func launch(
        against server: StubServer,
        session: AppLaunch.Session = .signedOut,
        deviceLanguages: [String]? = nil,
        perAppLanguage: String? = nil
    ) -> SignInScreen {
        SignInScreen(app: AppLaunch.launch(
            against: server, session: session, deviceLanguages: deviceLanguages, perAppLanguage: perAppLanguage
        ))
    }

    /// Types `text` into `field` after tapping it.
    func type(_ text: String, into field: XCUIElement) {
        field.tap()
        field.typeText(text)
    }
}

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
    var retry: XCUIElement { app.buttons["signIn.retry"] }
    var resend: XCUIElement { app.buttons["signIn.resend"] }
    var resent: XCUIElement { app.staticTexts["signIn.resent"] }
    var changeEmail: XCUIElement { app.buttons["signIn.changeEmail"] }
    var loading: XCUIElement { app.activityIndicators["signIn.loading"] }
    /// On the signed-in home: the account line, and the hello greeting the home keeps.
    var signedInAs: XCUIElement { app.staticTexts["home.signedInAs"] }
    /// The block holding the account line and Sign out.
    var account: XCUIElement { app.otherElements["home.account"] }
    var greeting: XCUIElement { app.staticTexts["hello.greeting"] }
    var homeRetry: XCUIElement { app.buttons["home.retry"] }
    var signOut: XCUIElement { app.buttons["home.signOut"] }

    /// Launches the app against `server`; the parameters are `AppLaunch.launch`'s.
    static func launch(
        against server: StubServer,
        session: AppLaunch.Session = .signedOut,
        deviceLanguages: [String]? = nil,
        perAppLanguage: String? = nil,
        textSize: String? = nil
    ) -> SignInScreen {
        SignInScreen(app: AppLaunch.launch(
            against: server, session: session, deviceLanguages: deviceLanguages, perAppLanguage: perAppLanguage,
            textSize: textSize
        ))
    }

    /// Types `text` into `field` after tapping it.
    func type(_ text: String, into field: XCUIElement) {
        field.tap()
        field.typeText(text)
    }

    /// Gets from TM-01 to the code step: types the address and asks for the code.
    func requestCode(for address: String, timeout: TimeInterval = 10) {
        XCTAssertTrue(email.waitUntilExists(timeout: timeout), "TM-01 shows the email field")
        type(address, into: email)
        sendCode.tap()
        XCTAssertTrue(code.waitUntilExists(timeout: timeout), "the code step opens")
    }

    /// Waits until `element` has stopped moving: its frame is the same at two checks in a row.
    func settle(_ element: XCUIElement) {
        var previous: CGRect?
        let settled = Polling.until(timeout: 3, interval: 0.2) {
            let frame = element.frame
            defer { previous = frame }
            return frame == previous
        }
        XCTAssertTrue(settled, "\(element.identifier) keeps moving")
    }

    /// Types `address`, asks for the code with the connection down, waits for the lost-connection message and settles
    /// it; then `afterOffline` runs (the audits), the connection comes back and the retry opens the code step.
    func requestCodeOfflineThenRetry(
        for address: String, on server: StubServer, timeout: TimeInterval = 10,
        whileOffline afterOffline: () throws -> Void
    ) rethrows {
        server.setOffline(true)
        type(address, into: email)
        tap(sendCode)
        XCTAssertTrue(error.waitUntilExists(timeout: timeout), "the lost-connection message shows")
        settle(error)
        settle(retry)
        try afterOffline()
        server.setOffline(false)
        tap(retry)
        XCTAssertTrue(code.waitUntilExists(timeout: timeout), "the retry opens the code step")
    }

    /// Taps `element` once it has stopped moving (the keyboard and the messages shift the layout for a moment), after
    /// scrolling the screen up until it can be hit: at the largest text size the keyboard of the code field covers the
    /// buttons below it.
    func tap(_ element: XCUIElement, scrollingUpTo attempts: Int = 6) {
        settle(element)
        scrollUp(until: { element.isHittable }, attempts: attempts)
        element.tap()
    }

    /// Drags the screen up until `isDone`, at most `attempts` times. The drag stays above the keyboard: a swipe on the
    /// whole window may start on a key.
    func scrollUp(until isDone: () -> Bool, attempts: Int) {
        var left = attempts
        while !isDone(), left > 0 {
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.45))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.1))
            start.press(forDuration: 0.05, thenDragTo: end)
            left -= 1
        }
    }

    /// Scrolls the screen up until `element` is whole inside the window and can be hit.
    func scrollIntoView(_ element: XCUIElement, attempts: Int = 8) {
        let window = app.windows.firstMatch.frame
        scrollUp(until: { window.contains(element.frame) && element.isHittable }, attempts: attempts)
    }
}

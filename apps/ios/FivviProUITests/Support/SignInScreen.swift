import XCTest

/// TM-01 and the signed-in home in a launched app. Elements are found by accessibility identifier, never by visible
/// text; the Android app uses the same values as test tags (Maestro).
@MainActor
struct SignInScreen {
    let app: XCUIApplication

    var title: XCUIElement { app.staticTexts["signIn.title"] }
    /// The Fivvi Pro day dial above the title.
    var logo: XCUIElement { app.images["signIn.logo"] }
    /// *Check je e-mail*, the heading of the code step.
    var checkEmailTitle: XCUIElement { app.staticTexts["signIn.checkEmailTitle"] }
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
        textSize: String? = nil,
        appearance: String? = nil,
        recordsOpenedLinks: Bool = false,
        countsRenders: Bool = false
    ) -> SignInScreen {
        SignInScreen(app: AppLaunch.launch(
            against: server, session: session, deviceLanguages: deviceLanguages, perAppLanguage: perAppLanguage,
            textSize: textSize, appearance: appearance, recordsOpenedLinks: recordsOpenedLinks,
            countsRenders: countsRenders
        ))
    }

    /// Types `text` into `field` once a tap has given it keyboard focus, and checks that all of it arrived
    /// (`XCUIElement.enter`). The code field acts on its last digit, so what it holds afterwards says nothing: it
    /// gets the typing alone.
    func type(_ text: String, into field: XCUIElement) {
        if field.identifier == code.identifier {
            field.focus()
            field.typeText(text)
        } else {
            field.enter(text)
        }
    }

    /// Gets from TM-01 to the code step: types the address and asks for the code.
    func requestCode(for address: String, timeout: TimeInterval = 10) {
        XCTAssertTrue(email.waitUntilExists(timeout: timeout), "TM-01 shows the email field")
        type(address, into: email)
        sendCode.tap()
        XCTAssertTrue(code.waitUntilExists(timeout: timeout), "the code step opens")
    }

    /// Waits until `element` has stopped moving: its frame is the same at three reads in a row. The deadline is long
    /// because a slow simulator stretches the keyboard and the layout changes; it only ends the wait for an element that
    /// never comes to rest (#385).
    func settle(_ element: XCUIElement) {
        let settled = Polling.settled(timeout: 30) { element.frame }
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
    /// scrolling the screen up until it can be hit and the keyboard is not over it: at the largest text size the keyboard
    /// of the code field covers the buttons below it. (On iOS 26 `isHittable` is true for a button under the keyboard,
    /// which then takes the tap: the keyboard's frame is checked too.)
    func tap(_ element: XCUIElement, scrollingUpTo attempts: Int = 6) {
        settle(element)
        scrollUp(until: { element.isHittable && !isUnderKeyboard(element) }, attempts: attempts)
        XCTAssertFalse(isUnderKeyboard(element), "\(element.identifier) is under the keyboard: the tap would hit a key")
        element.tap()
    }

    /// Whether the keyboard, when it is up, covers the middle of `element`: the keyboard's frame ends above the
    /// bottom of the window (the globe and dictation row), so anything from its top edge down is under it.
    private func isUnderKeyboard(_ element: XCUIElement) -> Bool {
        let keyboard = app.keyboards.firstMatch
        return keyboard.exists && element.frame.midY >= keyboard.frame.minY
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

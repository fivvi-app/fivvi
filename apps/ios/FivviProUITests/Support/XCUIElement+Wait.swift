import XCTest

extension XCUIElement {
    /// Whether the element exists within `timeout` seconds, checked every 50 ms (see `Polling`); use it in place of
    /// `waitForExistence(timeout:)`.
    func waitUntilExists(timeout: TimeInterval) -> Bool {
        Polling.until(timeout: timeout, condition: { exists })
    }

    /// Taps the element and returns whether `reached` exists within `timeout` seconds; when it doesn't, and the element
    /// can still be hit, taps it once more (`Polling.acting`). For the buttons that open a screen: on a slow CI
    /// simulator a tap right after launch is now and then dropped (#596). Never for a button whose second tap would
    /// do something else (adding, saving, deleting).
    func tap(until reached: XCUIElement, timeout: TimeInterval) -> Bool {
        Polling.acting(
            timeout: timeout, action: { tap() }, canRepeat: { exists && isHittable }, until: { reached.exists }
        )
    }
}

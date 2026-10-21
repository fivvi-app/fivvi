import XCTest

extension XCUIElement {
    /// Whether the element exists within `timeout` seconds, checked every 50 ms (see `Polling`); use it in place of
    /// `waitForExistence(timeout:)`.
    func waitUntilExists(timeout: TimeInterval) -> Bool {
        Polling.until(timeout: timeout, condition: { exists })
    }
}

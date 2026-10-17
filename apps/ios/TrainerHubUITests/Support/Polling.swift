import XCTest

/// Waits for a condition by checking it every `interval` seconds.
///
/// `XCUIElement.waitForExistence(timeout:)` takes about a second even when the element is already on screen: XCTest
/// first checks the predicate again a second after it was set up. With ~20 waits per locale that was a fifth of the UI
/// tests' time (#105). Checking `exists` ourselves costs milliseconds and proves the same: the element exists within
/// the timeout.
enum Polling {
    /// Whether `condition` held within `timeout` seconds; checks it once more at the deadline.
    @discardableResult
    static func until(timeout: TimeInterval, interval: TimeInterval = 0.05, _ condition: () -> Bool) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while !condition() {
            guard Date() < deadline else { return false }
            RunLoop.current.run(until: Date().addingTimeInterval(interval))
        }
        return true
    }
}

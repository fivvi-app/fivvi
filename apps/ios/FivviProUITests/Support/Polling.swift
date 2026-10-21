import XCTest

/// Waits for a condition by checking it every `interval` seconds.
///
/// `XCUIElement.waitForExistence(timeout:)` takes about a second even when the element is already on screen: XCTest
/// first checks the predicate again a second after it was set up. With ~20 waits per locale that was a fifth of the UI
/// tests' time (#105). Checking `exists` ourselves costs milliseconds and proves the same: the element exists within
/// the timeout.
enum Polling {
    /// Whether `condition` held within `timeout` seconds; checks it once more at the deadline. `now` and `wait` are
    /// the clock and the pause between checks, which `PollingTests` replaces so they don't sleep.
    @discardableResult
    static func until(
        timeout: TimeInterval,
        interval: TimeInterval = 0.05,
        now: () -> Date = Date.init,
        wait: (TimeInterval) -> Void = { RunLoop.current.run(until: Date().addingTimeInterval($0)) },
        condition: () -> Bool
    ) -> Bool {
        let deadline = now().addingTimeInterval(timeout)
        while !condition() {
            guard now() < deadline else { return false }
            wait(interval)
        }
        return true
    }
}

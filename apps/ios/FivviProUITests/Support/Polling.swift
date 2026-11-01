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

    /// Whether the value `read` returns stayed the same for `reads` reads in a row within `timeout` seconds, reading
    /// every `interval` seconds; reads once more at the deadline. For an element that moves into place (a frame during
    /// a layout change or an animation). The deadline is generous on purpose: it only ends the wait when something
    /// keeps moving for good, and a slow simulator stretches an animation far beyond the 3 s it once had (#385). A
    /// still element costs `reads - 1` intervals.
    static func settled<Value: Equatable>(
        timeout: TimeInterval,
        interval: TimeInterval = 0.2,
        reads: Int = 3,
        now: () -> Date = Date.init,
        wait: (TimeInterval) -> Void = { RunLoop.current.run(until: Date().addingTimeInterval($0)) },
        read: () -> Value
    ) -> Bool {
        let deadline = now().addingTimeInterval(timeout)
        var previous: Value?
        var inARow = 0
        while true {
            let value = read()
            inARow = value == previous ? inARow + 1 : 1
            previous = value
            if inARow >= reads { return true }
            guard now() < deadline else { return false }
            wait(interval)
        }
    }
}

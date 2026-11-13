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

    /// Does `action` (a tap), then waits up to `timeout` seconds for `until` to hold; when it didn't, and `canRepeat`
    /// says the action can still be done (the button is still there), does it again, at most `attempts` times in all.
    /// For a tap a slow simulator dropped: the screen on show stayed as it was for the whole wait, the way it did in
    /// two of the three en failures of #596 (nothing in the recording moved after the tap), and a person taps again.
    /// Each try has the whole `timeout`, so a tap that is only slow is not done twice. `report(attempt, attempts)` runs
    /// just before every repeated action: a tap that only works on the second try is a flaky test and must show as one
    /// (`TESTING.md §8`). `now` and `wait` are as in `until`.
    static func acting(
        attempts: Int = 2,
        timeout: TimeInterval,
        interval: TimeInterval = 0.05,
        now: () -> Date = Date.init,
        wait: (TimeInterval) -> Void = { RunLoop.current.run(until: Date().addingTimeInterval($0)) },
        action: () -> Void,
        canRepeat: () -> Bool,
        report: (_ attempt: Int, _ attempts: Int) -> Void,
        until reached: () -> Bool
    ) -> Bool {
        for attempt in 1...max(attempts, 1) {
            if attempt > 1 {
                if !canRepeat() { return false }
                report(attempt, attempts)
            }
            action()
            if until(timeout: timeout, interval: interval, now: now, wait: wait, condition: reached) { return true }
        }
        return false
    }

    /// How `typing` ended.
    enum Typed: Equatable {
        /// The field holds what it should, or something other than a start of it (the app changed the text: a capital,
        /// a correction; that is for the test's own assertions).
        case complete
        /// The field still holds only the start of what it should after every try; `held` is what it holds.
        case dropped(held: String)
    }

    /// Types `text` with `type` and waits up to `timeout` seconds for `read` to return `expected`; when the field holds
    /// only the start of it, the keyboard dropped the rest (on a loaded runner `typeText("Anna")` left "An", #1380),
    /// and the missing end is typed again, at most `attempts` times in all. A person sees the letters missing and types
    /// them. The wait ends at once when the field holds something that is not a start of `expected`, or when `read` finds
    /// nothing (the field is gone: a screen that moved on has nothing left to check). `report(attempt,
    /// attempts)` runs just before every repeated typing: typing that only works on the second try is a flaky test and
    /// must show as one (`TESTING.md §8`). `now` and `wait` are as in `until`.
    static func typing(
        _ text: String,
        expecting expected: String,
        attempts: Int = 3,
        timeout: TimeInterval = 3,
        interval: TimeInterval = 0.05,
        now: () -> Date = Date.init,
        wait: (TimeInterval) -> Void = { RunLoop.current.run(until: Date().addingTimeInterval($0)) },
        type: (String) -> Void,
        read: () -> String?,
        report: (_ attempt: Int, _ attempts: Int) -> Void
    ) -> Typed {
        var pending = text
        var held = ""
        for attempt in 1...max(attempts, 1) {
            if attempt > 1 { report(attempt, attempts) }
            type(pending)
            _ = until(timeout: timeout, interval: interval, now: now, wait: wait, condition: {
                guard let read = read() else {
                    held = expected  // the field is gone: nothing left to check
                    return true
                }
                held = read
                return held == expected || !expected.hasPrefix(held)
            })
            if held == expected || !expected.hasPrefix(held) { return .complete }
            pending = String(expected.dropFirst(held.count))
        }
        return .dropped(held: held)
    }

    /// The title of the activity a repeated typing leaves in the test's result, as `warning` does for a tap.
    static func typingWarning(identifier: String, attempt: Int, of attempts: Int) -> String {
        "::warning::flaky: typing into \(identifier) dropped characters, typing the rest "
            + "(try \(attempt) of \(attempts))"
    }

    /// The title of the activity a repeated tap leaves in the test's result, which `scripts/test-ios.sh` reports as
    /// flaky like a repeated start (`ReachableLaunch.warning`).
    static func warning(identifier: String, attempt: Int, of attempts: Int) -> String {
        "::warning::flaky: tap on \(identifier) had no effect, tapping again (tap \(attempt) of \(attempts))"
    }

    /// Whether the value `read` returns stayed the same for `reads` reads in a row, reading every `interval` seconds
    /// until the deadline of `timeout` seconds (and beyond it, below). For an element that moves into place (a frame
    /// during a layout change or an animation). The deadline is generous on purpose: it only ends the wait when
    /// something keeps moving for good, and a slow simulator stretches an animation far beyond the 3 s it once had
    /// (#385). A still element costs `reads - 1` intervals.
    ///
    /// `read` returns nil when there is nothing to read yet (the element is not there): that is not a value, it never
    /// counts towards `reads` and ends a run of equal values. The deadline does not cut short a value that stood
    /// still: on a slow runner one read takes seconds (XCTest waits for the app to be idle before every snapshot; a
    /// read of the tab bar took 12 s, #679), so a deadline measured in seconds left room for one read, and one read
    /// cannot tell a still value from a moving one. Past the deadline the wait goes on while the last two reads were
    /// equal (the value stood still, `reads` equal reads may follow) and returns false at the first read that moved or
    /// found nothing, once it has made two reads.
    static func settled<Value: Equatable>(
        timeout: TimeInterval,
        interval: TimeInterval = 0.2,
        reads: Int = 3,
        now: () -> Date = Date.init,
        wait: (TimeInterval) -> Void = { RunLoop.current.run(until: Date().addingTimeInterval($0)) },
        read: () -> Value?
    ) -> Bool {
        let deadline = now().addingTimeInterval(timeout)
        var previous: Value?
        var inARow = 0
        var made = 0
        while true {
            let value = read()
            made += 1
            if let value {
                inARow = value == previous ? inARow + 1 : 1
            } else {
                inARow = 0
            }
            previous = value
            if inARow >= reads { return true }
            guard inARow >= 2 || made < 2 || now() < deadline else { return false }
            wait(interval)
        }
    }
}

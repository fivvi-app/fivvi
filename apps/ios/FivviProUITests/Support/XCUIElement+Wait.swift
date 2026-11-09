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
    /// do something else (adding, saving, deleting). A repeated tap is reported as a `::warning::flaky` activity.
    func tap(until reached: XCUIElement, timeout: TimeInterval) -> Bool {
        Polling.acting(
            timeout: timeout, action: { tap() }, canRepeat: { exists && isHittable },
            report: { attempt, attempts in
                // Named after what the tap was on, so CI's list of flaky tests says which button to look at.
                XCTContext.runActivity(
                    named: Polling.warning(identifier: identifier, attempt: attempt, of: attempts)
                ) { _ in }
            },
            until: { reached.exists }
        )
    }

    /// The label, read in one snapshot; nil when the element is not there (or went while it was read).
    var labelIfPresent: String? {
        try? snapshot().label
    }

    /// Whether a person's typing would reach this element: the keyboard is on it. A text field takes its focus a
    /// moment after the tap, and not at all when the tap came while the app was still drawing its first frames.
    var hasKeyboardFocus: Bool {
        exists && (value(forKey: "hasKeyboardFocus") as? Bool) == true
    }

    /// Taps the element until it has keyboard focus, and fails the test when it never gets it, before the `typeText`
    /// that would fail on it with "Neither element nor any descendant has keyboard focus". On a slow CI simulator a
    /// tap on a field right after the screen came up now and then left it without focus (#679): the app had not
    /// finished its first frame, and a person taps again. A tap on a field that has focus changes nothing, so the
    /// repeat is safe; one is reported as a `::warning::flaky` activity (`Polling.acting`).
    func focus(timeout: TimeInterval = 10, file: StaticString = #filePath, line: UInt = #line) {
        let focused = Polling.acting(
            timeout: timeout, action: { tap() }, canRepeat: { exists && isHittable },
            report: { attempt, attempts in
                XCTContext.runActivity(
                    named: Polling.warning(identifier: identifier, attempt: attempt, of: attempts)
                ) { _ in }
            },
            until: { hasKeyboardFocus }
        )
        XCTAssertTrue(focused, "\(identifier) has no keyboard focus after a tap", file: file, line: line)
    }
}

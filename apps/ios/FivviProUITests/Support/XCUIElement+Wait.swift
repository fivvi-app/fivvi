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
            report: reportRepeatedTap, until: { reached.exists }
        )
    }

    /// Leaves the `::warning::flaky` activity of a repeated tap in the test's result, named after what the tap was on, so
    /// CI's list of flaky tests says which element to look at.
    private func reportRepeatedTap(_ attempt: Int, _ attempts: Int) {
        XCTContext.runActivity(
            named: Polling.warning(identifier: identifier, attempt: attempt, of: attempts)
        ) { _ in }
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
            report: reportRepeatedTap, until: { hasKeyboardFocus }
        )
        XCTAssertTrue(focused, "\(identifier) has no keyboard focus after a tap", file: file, line: line)
    }

    /// What the text field holds: nil when it is not there, and "" for an empty field, where `value` is its placeholder.
    var fieldText: String? {
        guard exists, let value = value as? String else { return nil }
        return value == placeholderValue ? "" : value
    }

    /// Taps the field until it has keyboard focus, types `text` after what it holds (`replacing`: in place of it) and
    /// checks that all of it arrived. On a loaded CI simulator the keyboard now and then drops the end of what is typed:
    /// `typeText("Anna")` left "An" (#1380). The missing end is typed again, reported as a `::warning::flaky`
    /// activity (`Polling.typing`), and a field that still lacks letters fails here, with what it holds, not at some
    /// assertion further on. Not for a field that acts on the last character (the sign-in code), whose value after
    /// typing says nothing.
    func enter(_ text: String, replacing: Bool = false, file: StaticString = #filePath, line: UInt = #line) {
        focus(file: file, line: line)
        if replacing { clear(file: file, line: line) }
        if text.isEmpty { return }
        let before = fieldText ?? ""
        let result = Polling.typing(
            text, expecting: before + text, type: { typeText($0) }, read: { fieldText },
            report: reportRepeatedTyping
        )
        if case .dropped(let held) = result {
            XCTFail("typing \"\(text)\" into \(identifier) left \"\(held)\" in it", file: file, line: line)
        }
    }

    /// Leaves the `::warning::flaky` activity of repeated typing in the test's result, named after the field.
    private func reportRepeatedTyping(_ attempt: Int, _ attempts: Int) {
        XCTContext.runActivity(
            named: Polling.typingWarning(identifier: identifier, attempt: attempt, of: attempts)
        ) { _ in }
    }

    /// Deletes what the field holds, once more for the letters a loaded runner left.
    private func clear(file: StaticString, line: UInt) {
        for _ in 0..<3 {
            guard let held = fieldText, !held.isEmpty else { return }
            typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: held.count))
            _ = Polling.until(timeout: 1) { (self.fieldText ?? "").count < held.count }
        }
        if let held = fieldText, !held.isEmpty {
            XCTFail("\(identifier) still holds \"\(held)\" after deleting it", file: file, line: line)
        }
    }
}

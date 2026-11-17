import XCTest

/// `Polling.typing`: letters a loaded runner dropped are typed again (#1380), on a clock the test moves.
final class PollingTypingTests: XCTestCase {
    /// A clock that only moves when `Polling` waits, so nothing here sleeps.
    private final class Clock {
        private(set) var now = Date(timeIntervalSince1970: 0)

        func wait(_ seconds: TimeInterval) {
            now = now.addingTimeInterval(seconds)
        }
    }

    /// A field the test types into: `keeps` says how much of each typed text it keeps (a loaded runner dropped the end
    /// of "Anna"), `lag` how many reads still show the old value after typing.
    private final class Field {
        var value = ""
        private(set) var typed: [String] = []
        private var keeps: [Int]
        private var lag: Int
        private var reads = 0
        private var shown = ""
        /// The field is not there any more after typing: the screen moved on.
        var gone = false

        init(keeps: [Int], lag: Int = 0) {
            self.keeps = keeps
            self.lag = lag
        }

        func type(_ text: String) {
            typed.append(text)
            let keep = keeps.isEmpty ? text.count : keeps.removeFirst()
            value += String(text.prefix(keep))
            reads = 0
        }

        func read() -> String {
            reads += 1
            if reads <= lag { return shown }
            shown = value
            return value
        }
    }

    private func typing(
        _ text: String, expecting expected: String? = nil, into field: Field, attempts: Int = 3,
        reports: inout [Int]
    ) -> Polling.Typed {
        let clock = Clock()
        var reported: [Int] = []
        let result = Polling.typing(
            text, expecting: expected ?? text, attempts: attempts, now: { clock.now }, wait: clock.wait,
            type: field.type, read: { field.gone ? nil : field.read() },
            report: { attempt, _ in reported.append(attempt) }
        )
        reports = reported
        return result
    }

    func test_E020_AC14_typingThatReachesTheFieldIsDoneOnce() {
        let field = Field(keeps: [4])
        var reports: [Int] = []

        XCTAssertEqual(typing("Anna", into: field, reports: &reports), .complete)

        XCTAssertEqual(field.typed, ["Anna"])
        XCTAssertEqual(reports, [])
    }

    func test_E020_AC14_aDroppedEndIsTypedAgainAndReported() {
        // The failure of #1380: the field held "An" after typing "Anna".
        let field = Field(keeps: [2])
        var reports: [Int] = []

        XCTAssertEqual(typing("Anna", into: field, reports: &reports), .complete)

        XCTAssertEqual(field.typed, ["Anna", "na"], "only the missing end is typed again")
        XCTAssertEqual(field.value, "Anna")
        XCTAssertEqual(reports, [2])
    }

    func test_E020_AC14_aFieldThatKeepsDroppingEndsWithItsOwnResultAtTheAttempts() {
        let field = Field(keeps: [2, 1, 0])
        var reports: [Int] = []

        XCTAssertEqual(typing("Anna", into: field, reports: &reports), .dropped(held: "Ann"))

        XCTAssertEqual(field.typed, ["Anna", "na", "a"])
        XCTAssertEqual(reports, [2, 3])
    }

    func test_E020_AC14_aValueThatOnlyShowsLateIsWaitedForNotTypedAgain() {
        let field = Field(keeps: [4], lag: 5)
        var reports: [Int] = []

        XCTAssertEqual(typing("Anna", into: field, reports: &reports), .complete)

        XCTAssertEqual(field.typed, ["Anna"], "the letters were there, only the read was late")
        XCTAssertEqual(reports, [])
    }

    func test_E020_AC14_typingAfterWhatTheFieldHoldsExpectsTheWholeValue() {
        let field = Field(keeps: [3])
        field.value = "Sarah "
        var reports: [Int] = []

        XCTAssertEqual(typing("Bakker", expecting: "Sarah Bakker", into: field, reports: &reports), .complete)

        XCTAssertEqual(field.typed, ["Bakker", "ker"])
        XCTAssertEqual(field.value, "Sarah Bakker")
    }

    func test_E020_AC14_textTheAppChangedIsNotTypedAgain() {
        // A capital or a correction is no dropped letter: nothing is typed twice, the test's assertions judge it.
        let field = Field(keeps: [])
        var reports: [Int] = []

        XCTAssertEqual(typing("anna", expecting: "Anna", into: field, reports: &reports), .complete)

        XCTAssertEqual(field.typed, ["anna"])
        XCTAssertEqual(reports, [])
    }

    func test_E020_AC14_aFieldThatStaysEmptyIsDropped() {
        let field = Field(keeps: [0, 0, 0])
        var reports: [Int] = []

        XCTAssertEqual(typing("Anna", into: field, reports: &reports), .dropped(held: ""))

        XCTAssertEqual(field.typed, ["Anna", "Anna", "Anna"])
    }

    func test_E020_AC14_aFieldThatIsGoneAfterTypingHasNothingLeftToCheck() {
        let field = Field(keeps: [2])
        field.gone = true
        var reports: [Int] = []

        XCTAssertEqual(typing("Anna", into: field, reports: &reports), .complete)

        XCTAssertEqual(field.typed, ["Anna"])
        XCTAssertEqual(reports, [])
    }

    func test_E020_AC14_warningNamesTheFieldForCI() {
        XCTAssertEqual(
            Polling.typingWarning(identifier: "kit.field.invalid", attempt: 2, of: 3),
            "::warning::flaky: typing into kit.field.invalid dropped characters, typing the rest (try 2 of 3)"
        )
    }
}

import XCTest

/// The polling wait the UI tests use instead of `waitForExistence(timeout:)` (#105), on a clock the test moves.
final class PollingTests: XCTestCase {
    /// A clock that only moves when `Polling` waits, so nothing here sleeps.
    private final class Clock {
        private(set) var now = Date(timeIntervalSince1970: 0)
        private(set) var waits: [TimeInterval] = []

        func wait(_ seconds: TimeInterval) {
            waits.append(seconds)
            now = now.addingTimeInterval(seconds)
        }
    }

    func test_E002_returnsAtOnceWhenTheConditionHolds() {
        let clock = Clock()
        var checks = 0

        let held = Polling.until(
            timeout: 10, now: { clock.now }, wait: clock.wait,
            condition: {
                checks += 1
                return true
            }
        )

        XCTAssertTrue(held)
        XCTAssertEqual(checks, 1)
        XCTAssertEqual(clock.waits, [])
    }

    func test_E002_checksAgainEveryIntervalUntilTheConditionHolds() {
        let clock = Clock()
        var checks = 0

        let held = Polling.until(
            timeout: 10, interval: 0.25, now: { clock.now }, wait: clock.wait,
            condition: {
                checks += 1
                return checks == 3
            }
        )

        XCTAssertTrue(held)
        XCTAssertEqual(checks, 3)
        XCTAssertEqual(clock.waits, [0.25, 0.25])
    }

    func test_E002_givesUpAtTheDeadlineAfterAFinalCheck() {
        let clock = Clock()
        var checks = 0

        let held = Polling.until(
            timeout: 1, interval: 0.25, now: { clock.now }, wait: clock.wait,
            condition: {
                checks += 1
                return false
            }
        )

        XCTAssertFalse(held)
        XCTAssertEqual(checks, 5, "at 0, 0.25, 0.5, 0.75 and the deadline, 1")
        XCTAssertEqual(clock.waits, [0.25, 0.25, 0.25, 0.25])
    }

    func test_E002_aConditionThatHoldsAtTheDeadlineCounts() {
        let clock = Clock()
        var checks = 0

        let held = Polling.until(
            timeout: 1, interval: 0.5, now: { clock.now }, wait: clock.wait,
            condition: {
                checks += 1
                return checks == 3
            }
        )

        XCTAssertTrue(held)
        XCTAssertEqual(clock.now, Date(timeIntervalSince1970: 1))
    }
}

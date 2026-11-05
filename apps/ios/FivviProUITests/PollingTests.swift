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

    // `Polling.settled`: the wait for a value that stops changing (the frame of a moving element, #385).

    func test_F001N_AC15_aValueThatNeverChangesSettlesAfterThreeReads() {
        let clock = Clock()
        var reads = 0

        let settled = Polling.settled(
            timeout: 30, interval: 0.2, now: { clock.now }, wait: clock.wait,
            read: {
                reads += 1
                return "still"
            }
        )

        XCTAssertTrue(settled)
        XCTAssertEqual(reads, 3)
        XCTAssertEqual(clock.waits, [0.2, 0.2])
    }

    func test_F001N_AC15_twoEqualReadsAreNotEnoughWhenTheValueMovesAgain() {
        let clock = Clock()
        let values = ["a", "a", "b", "b", "b"]
        var reads = 0

        let settled = Polling.settled(
            timeout: 30, interval: 0.2, now: { clock.now }, wait: clock.wait,
            read: {
                defer { reads += 1 }
                return values[reads]
            }
        )

        XCTAssertTrue(settled)
        XCTAssertEqual(reads, 5, "the first two equal reads were followed by a move")
    }

    /// A slow runner stretches the animation: the old check gave up 3 s after it began, with the greeting still moving.
    func test_F001N_AC15_aValueThatMovesLongerThanThreeSecondsStillSettles() {
        let clock = Clock()
        var reads = 0

        let settled = Polling.settled(
            timeout: 30, interval: 0.2, now: { clock.now }, wait: clock.wait,
            read: {
                reads += 1
                return min(reads, 40)
            }
        )

        XCTAssertTrue(settled)
        XCTAssertGreaterThan(clock.now.timeIntervalSince1970, 3, "it moved for more than the old 3 s deadline")
    }

    func test_F001N_AC15_aValueThatKeepsMovingFailsAtTheDeadline() {
        let clock = Clock()
        var reads = 0

        let settled = Polling.settled(
            timeout: 30, interval: 0.2, now: { clock.now }, wait: clock.wait,
            read: {
                reads += 1
                return reads
            }
        )

        XCTAssertFalse(settled)
        let elapsed = clock.now.timeIntervalSince1970
        XCTAssertGreaterThanOrEqual(elapsed, 30)
        XCTAssertLessThan(elapsed, 30.2, "it stopped at the deadline, not a read later")
    }

    // `Polling.acting`: an action (a tap) whose result is waited for, done again when it had none (#596).

    func test_E008_anActionWhoseResultComesIsDoneOnce() {
        let clock = Clock()
        var done = 0

        let reached = Polling.acting(
            timeout: 10, now: { clock.now }, wait: clock.wait,
            action: { done += 1 },
            canRepeat: { true },
            until: { done == 1 }
        )

        XCTAssertTrue(reached)
        XCTAssertEqual(done, 1)
    }

    /// A tap that a slow simulator dropped (the screen on show did not change for the whole wait): a person would tap
    /// again, so the second try is the same tap, after the first one's full wait.
    func test_E008_anActionWithoutResultIsDoneAgainAfterTheWholeWait() {
        let clock = Clock()
        var done = 0

        let reached = Polling.acting(
            timeout: 10, interval: 1, now: { clock.now }, wait: clock.wait,
            action: { done += 1 },
            canRepeat: { true },
            until: { done == 2 }
        )

        XCTAssertTrue(reached)
        XCTAssertEqual(done, 2)
        XCTAssertGreaterThanOrEqual(clock.now.timeIntervalSince1970, 10, "the first try had its whole timeout")
    }

    func test_E008_anActionIsNotDoneAgainWhenItCannotBeRepeated() {
        let clock = Clock()
        var done = 0

        let reached = Polling.acting(
            timeout: 10, interval: 1, now: { clock.now }, wait: clock.wait,
            action: { done += 1 },
            canRepeat: { false },
            until: { false }
        )

        XCTAssertFalse(reached)
        XCTAssertEqual(done, 1, "the button is gone: a second tap would hit something else")
    }

    func test_E008_anActionThatNeverHasAResultStopsAtTheAttemptsAndFails() {
        let clock = Clock()
        var done = 0

        let reached = Polling.acting(
            attempts: 2, timeout: 10, interval: 1, now: { clock.now }, wait: clock.wait,
            action: { done += 1 },
            canRepeat: { true },
            until: { false }
        )

        XCTAssertFalse(reached)
        XCTAssertEqual(done, 2)
        XCTAssertGreaterThanOrEqual(clock.now.timeIntervalSince1970, 20)
    }
}

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
            report: { _, _ in },
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
            report: { _, _ in },
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
            report: { _, _ in },
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
            report: { _, _ in },
            until: { false }
        )

        XCTAssertFalse(reached)
        XCTAssertEqual(done, 2)
        XCTAssertGreaterThanOrEqual(clock.now.timeIntervalSince1970, 20)
    }

    /// A tap that only works on the second try is a flaky test (`TESTING.md §8`): the repeat is reported, just before it.
    func test_E008_aRepeatedActionIsReportedOnceBeforeTheRepeat() {
        let clock = Clock()
        var events: [String] = []

        let reached = Polling.acting(
            attempts: 2, timeout: 10, interval: 1, now: { clock.now }, wait: clock.wait,
            action: { events.append("action") },
            canRepeat: { true },
            report: { attempt, total in events.append("report \(attempt) of \(total)") },
            until: { events.filter { $0 == "action" }.count == 2 }
        )

        XCTAssertTrue(reached)
        XCTAssertEqual(events, ["action", "report 2 of 2", "action"])
    }

    func test_E008_nothingIsReportedWhenTheFirstTryWorks() {
        let clock = Clock()
        var reports = 0

        _ = Polling.acting(
            timeout: 10, now: { clock.now }, wait: clock.wait,
            action: {},
            canRepeat: { true },
            report: { _, _ in reports += 1 },
            until: { true }
        )

        XCTAssertEqual(reports, 0)
    }

    func test_E008_nothingIsReportedWhenTheActionCannotBeRepeated() {
        let clock = Clock()
        var reports = 0

        _ = Polling.acting(
            timeout: 10, interval: 1, now: { clock.now }, wait: clock.wait,
            action: {},
            canRepeat: { false },
            report: { _, _ in reports += 1 },
            until: { false }
        )

        XCTAssertEqual(reports, 0, "no second tap, so nothing to report")
    }

    func test_E008_warningNamesTheTapForCI() {
        XCTAssertEqual(
            Polling.warning(identifier: "home.clients", attempt: 2, of: 2),
            "::warning::flaky: tap on home.clients had no effect, tapping again (tap 2 of 2)"
        )
    }
}

// `Polling.settled` on a slow runner and with nothing to read yet (#679).
extension PollingTests {
    /// On a slow runner one read is slow: XCTest waits for the app to be idle before every snapshot, and a read of the
    /// tab bar took 12 s (#679). The deadline is for a value that keeps moving; it does not cut short a value that
    /// stood still at every read it did.
    func test_E008_aStillValueSettlesEvenWhenEveryReadTakesLongerThanTheDeadline() {
        let clock = Clock()
        var reads = 0

        let settled = Polling.settled(
            timeout: 10, interval: 0.2, now: { clock.now }, wait: clock.wait,
            read: {
                reads += 1
                clock.wait(12)
                return "still"
            }
        )

        XCTAssertTrue(settled)
        XCTAssertEqual(reads, 3)
    }

    func test_E008_aSlowValueThatMovesAtTheSecondReadFailsAtTheDeadline() {
        let clock = Clock()
        var reads = 0

        let settled = Polling.settled(
            timeout: 10, interval: 0.2, now: { clock.now }, wait: clock.wait,
            read: {
                reads += 1
                clock.wait(12)
                return reads
            }
        )

        XCTAssertFalse(settled)
        XCTAssertEqual(reads, 2, "one read says nothing about movement, the second does")
    }

    /// A read that returns nil found nothing to read yet (the bar is not there): it is not a value, so three of them
    /// in a row are not a settled value.
    func test_E008_readsThatFindNothingAreNotASettledValue() {
        let clock = Clock()
        let values: [String?] = [nil, nil, nil, "bar", "bar", "bar"]
        var reads = 0

        let settled = Polling.settled(
            timeout: 30, interval: 0.2, now: { clock.now }, wait: clock.wait,
            read: {
                defer { reads += 1 }
                return values[reads]
            }
        )

        XCTAssertTrue(settled)
        XCTAssertEqual(reads, 6, "it settled on the bar, not on the three empty reads before it")
    }

    func test_E008_aValueThatIsNeverFoundFailsAtTheDeadline() {
        let clock = Clock()

        let settled = Polling.settled(
            timeout: 5, interval: 0.2, now: { clock.now }, wait: clock.wait,
            read: { () -> String? in nil }
        )

        XCTAssertFalse(settled)
        XCTAssertGreaterThanOrEqual(clock.now.timeIntervalSince1970, 5)
    }
}

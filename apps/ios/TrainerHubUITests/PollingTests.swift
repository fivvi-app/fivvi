import XCTest

/// The polling wait the UI tests use instead of `waitForExistence(timeout:)` (#105).
final class PollingTests: XCTestCase {
    func test_E002_returnsAtOnceWhenTheConditionHolds() {
        let started = Date()

        XCTAssertTrue(Polling.until(timeout: 10) { true })

        XCTAssertLessThan(Date().timeIntervalSince(started), 1)
    }

    func test_E002_checksAgainUntilTheConditionHolds() {
        var checks = 0

        let held = Polling.until(timeout: 10, interval: 0.01) {
            checks += 1
            return checks == 3
        }

        XCTAssertTrue(held)
        XCTAssertEqual(checks, 3)
    }

    func test_E002_givesUpAfterTheTimeout() {
        let started = Date()

        XCTAssertFalse(Polling.until(timeout: 0.3, interval: 0.01) { false })

        XCTAssertGreaterThanOrEqual(Date().timeIntervalSince(started), 0.3)
    }
}

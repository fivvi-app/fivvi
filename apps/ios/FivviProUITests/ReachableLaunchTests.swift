import XCTest

/// The launch that starts the app again when the first start left it without an accessibility hierarchy (#388), with
/// the launch, the probe and the terminate replaced so no app runs.
final class ReachableLaunchTests: XCTestCase {
    private final class Steps {
        var events: [String] = []
        var answers: [Bool]
        var running: Bool

        init(reachable: [Bool], running: Bool = true) {
            answers = reachable
            self.running = running
        }

        func launch() { events.append("launch") }
        func isRunning() -> Bool { running }
        func report(_ attempt: Int, _ total: Int) { events.append("report \(attempt)/\(total)") }
        func terminate() { events.append("terminate") }

        func isReachable() -> Bool {
            events.append("probe")
            return answers.isEmpty ? false : answers.removeFirst()
        }
    }

    private func run(_ steps: Steps, attempts: Int) -> Int? {
        ReachableLaunch.launch(
            attempts: attempts, launch: steps.launch, isReachable: steps.isReachable,
            isRunning: steps.isRunning, terminate: steps.terminate, report: steps.report
        )
    }

    func test_F001N_launchesOnceWhenTheAppAnswers() {
        let steps = Steps(reachable: [true])

        XCTAssertEqual(run(steps, attempts: 2), 1)
        XCTAssertEqual(steps.events, ["launch", "probe"])
    }

    func test_F001N_reportsTerminatesAndLaunchesAgainWhenTheRunningAppDoesNotAnswer() {
        let steps = Steps(reachable: [false, true])

        XCTAssertEqual(run(steps, attempts: 2), 2)
        XCTAssertEqual(steps.events, ["launch", "probe", "report 2/2", "terminate", "launch", "probe"])
    }

    func test_F001N_givesUpAfterTheLastAttemptAndLeavesTheAppRunning() {
        let steps = Steps(reachable: [false, false, false])

        XCTAssertNil(run(steps, attempts: 3), "the test then fails on its own query, as it did before")
        XCTAssertEqual(
            steps.events,
            [
                "launch", "probe", "report 2/3", "terminate",
                "launch", "probe", "report 3/3", "terminate",
                "launch", "probe"
            ]
        )
    }

    func test_F001N_doesNotLaunchAgainWhenTheAppIsNotRunning() {
        let steps = Steps(reachable: [false, true], running: false)

        XCTAssertNil(run(steps, attempts: 2), "a crash at start is the app's bug: the test fails on it")
        XCTAssertEqual(steps.events, ["launch", "probe"])
    }

    func test_F001N_warningNamesTheStartForCI() {
        XCTAssertEqual(
            ReachableLaunch.warning(attempt: 2, of: 2),
            "::warning::flaky: app unreadable after start, starting it again (start 2 of 2)"
        )
    }
}

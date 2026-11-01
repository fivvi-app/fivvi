import XCTest

/// The launch that starts the app again when the first start left it without an accessibility hierarchy (#388), with
/// the launch, the probe and the terminate replaced so no app runs.
final class ReachableLaunchTests: XCTestCase {
    private final class Steps {
        var events: [String] = []
        var answers: [Bool]

        init(reachable: [Bool]) {
            answers = reachable
        }

        func launch() { events.append("launch") }
        func terminate() { events.append("terminate") }

        func isReachable() -> Bool {
            events.append("probe")
            return answers.isEmpty ? false : answers.removeFirst()
        }
    }

    func test_F001N_launchesOnceWhenTheAppAnswers() {
        let steps = Steps(reachable: [true])

        let started = ReachableLaunch.launch(
            attempts: 3, launch: steps.launch, isReachable: steps.isReachable, terminate: steps.terminate
        )

        XCTAssertEqual(started, 1)
        XCTAssertEqual(steps.events, ["launch", "probe"])
    }

    func test_F001N_terminatesAndLaunchesAgainWhenTheAppDoesNotAnswer() {
        let steps = Steps(reachable: [false, false, true])

        let started = ReachableLaunch.launch(
            attempts: 3, launch: steps.launch, isReachable: steps.isReachable, terminate: steps.terminate
        )

        XCTAssertEqual(started, 3)
        XCTAssertEqual(
            steps.events,
            ["launch", "probe", "terminate", "launch", "probe", "terminate", "launch", "probe"]
        )
    }

    func test_F001N_givesUpAfterTheLastAttemptAndLeavesTheAppRunning() {
        let steps = Steps(reachable: [false, false])

        let started = ReachableLaunch.launch(
            attempts: 2, launch: steps.launch, isReachable: steps.isReachable, terminate: steps.terminate
        )

        XCTAssertNil(started, "the test then fails on its own query, as it did before")
        XCTAssertEqual(steps.events, ["launch", "probe", "terminate", "launch", "probe"])
    }
}

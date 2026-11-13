import XCTest

/// The app-lifecycle steps (terminate, launch) that XCTest itself fails on a loaded CI simulator without any assertion
/// failing (#1291), with the step and the check replaced so no app runs.
@MainActor
final class AppLifecycleTests: XCTestCase {
    private final class Steps {
        var events: [String] = []
        var done: [Bool]

        init(done: [Bool]) {
            self.done = done
        }

        func step(tolerant: Bool) { events.append(tolerant ? "step tolerant" : "step") }
        func report(_ attempt: Int, _ total: Int) { events.append("report \(attempt)/\(total)") }

        func isDone() -> Bool {
            events.append("check")
            return done.isEmpty ? false : done.removeFirst()
        }
    }

    private func run(_ steps: Steps, attempts: Int) -> Int? {
        AppLifecycle.perform(attempts: attempts, step: steps.step, isDone: steps.isDone, report: steps.report)
    }

    func test_F001N_doesTheStepOnceWhenItWorked() {
        let steps = Steps(done: [true])

        XCTAssertEqual(run(steps, attempts: 2), 1)
        XCTAssertEqual(steps.events, ["step tolerant", "check"])
    }

    func test_F001N_reportsAndDoesTheStepAgainWhenItDidNotTakeEffect() {
        let steps = Steps(done: [false, true])

        XCTAssertEqual(run(steps, attempts: 2), 2)
        XCTAssertEqual(steps.events, ["step tolerant", "check", "report 2/2", "step", "check"])
    }

    func test_F001N_onlyTheLastTryCanFailTheTest() {
        let steps = Steps(done: [false, false, false])

        XCTAssertNil(run(steps, attempts: 3), "the test then fails on its own step or query, as it did before")
        XCTAssertEqual(
            steps.events,
            [
                "step tolerant", "check", "report 2/3",
                "step tolerant", "check", "report 3/3",
                "step", "check"
            ]
        )
    }

    func test_F001N_aSingleTryIsNeverTolerant() {
        let steps = Steps(done: [false])

        XCTAssertNil(run(steps, attempts: 1))
        XCTAssertEqual(steps.events, ["step", "check"])
    }

    func test_F001N_warningNamesTheStepForCI() {
        XCTAssertEqual(
            AppLifecycle.warning(step: "stopping", attempt: 2, of: 2),
            "::warning::flaky: XCTest could not finish stopping the app, doing it again (try 2 of 2)"
        )
    }
}

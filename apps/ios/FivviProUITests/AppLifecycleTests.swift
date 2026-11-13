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

        var result = AppLifecycle.StepResult()

        func step(tolerant: Bool) -> AppLifecycle.StepResult {
            events.append(tolerant ? "step tolerant" : "step")
            return result
        }
        func report(_ attempt: Int, _ total: Int) { events.append("report \(attempt)/\(total)") }
        func reportTolerated(_ attempt: Int, _ total: Int) { events.append("tolerated \(attempt)/\(total)") }

        func isDone() -> Bool {
            events.append("check")
            return done.isEmpty ? false : done.removeFirst()
        }
    }

    private func run(_ steps: Steps, attempts: Int) -> Int? {
        AppLifecycle.perform(
            attempts: attempts,
            step: steps.step,
            isDone: steps.isDone,
            report: steps.report,
            reportTolerated: steps.reportTolerated
        )
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

    func test_F001N_doesNotRepeatAStepThatRecordedAnIssueThatIsNotTolerable() {
        let steps = Steps(done: [false, true])
        steps.result.mayRepeat = false

        XCTAssertNil(run(steps, attempts: 2), "an app that crashed at launch is a failure of the first try")
        XCTAssertEqual(steps.events, ["step tolerant", "check"])
    }

    /// XCTest's timeout was recorded (and tolerated) but the app did stop or start: nothing is done again, and the
    /// slow simulator must still show in CI as flaky.
    func test_F001N_reportsATolerantTryThatTookEffect() {
        let steps = Steps(done: [true])
        steps.result.tolerated = true

        XCTAssertEqual(run(steps, attempts: 2), 1)
        XCTAssertEqual(steps.events, ["step tolerant", "check", "tolerated 1/2"])
    }

    func test_F001N_reportsATolerantTryThatTookEffectOnTheSecondTryToo() {
        let steps = Steps(done: [false, true])
        steps.result.tolerated = true

        XCTAssertEqual(run(steps, attempts: 2), 2)
        XCTAssertEqual(steps.events, ["step tolerant", "check", "report 2/2", "step", "check", "tolerated 2/2"])
    }

    func test_F001N_reportsNothingForATryThatToleratedNothing() {
        let steps = Steps(done: [true])

        XCTAssertEqual(run(steps, attempts: 2), 1)
        XCTAssertFalse(steps.events.contains { $0.hasPrefix("tolerated") })
    }

    func test_F001N_warningNamesTheStepForCI() {
        XCTAssertEqual(
            AppLifecycle.warning(step: "stopping", attempt: 2, of: 2),
            "::warning::flaky: XCTest could not finish stopping the app, doing it again (try 2 of 2)"
        )
        XCTAssertEqual(
            AppLifecycle.toleratedWarning(step: "starting", attempt: 1, of: 2),
            "::warning::flaky: XCTest timed out starting the app, but it took effect (try 1 of 2)"
        )
    }

    // MARK: the issues of XCTest's own lifecycle steps

    private func issue(_ message: String) -> XCTIssue {
        XCTIssue(type: .assertionFailure, compactDescription: message)
    }

    func test_F001N_toleratesOnlyTheTwoLifecycleMessages() {
        XCTAssertTrue(AppLifecycle.isTolerable(issue(
            "Failed to terminate app.fivvi.pro:14761: Failed to terminate app.fivvi.pro:0"
        )))
        XCTAssertTrue(AppLifecycle.isTolerable(issue(
            "Failed to get background assertion for target app with pid 10371: Timed out while acquiring it."
        )))
        XCTAssertFalse(AppLifecycle.isTolerable(issue("app.fivvi.pro crashed in -[Foo bar]")))
        XCTAssertFalse(AppLifecycle.isTolerable(issue("Failed to launch app.fivvi.pro")))
    }

    func test_F001N_aToleratedIssueIsNoFailureAndIsSaid() {
        let result = AppLifecycle.tolerating(true) { XCTFail("Failed to terminate app.fivvi.pro:0") }

        XCTAssertEqual(result, AppLifecycle.StepResult(mayRepeat: true, tolerated: true))
    }

    func test_F001N_aToleratedStepThatRecordsNothingIsNoFailure() {
        XCTAssertEqual(AppLifecycle.tolerating(true) {}, AppLifecycle.StepResult(mayRepeat: true, tolerated: false))
    }

    /// The matcher lets the issue through, so it is a failure of the test as it was before; the test expects that one
    /// failure (an unexpected one would fail it, and none at all too: the expectation is strict).
    func test_F001N_anIssueThatIsNotTolerableFailsOnTheFirstTry() {
        let expected = XCTExpectedFailure.Options()
        expected.issueMatcher = { $0.compactDescription.contains("crashed at launch") }

        XCTExpectFailure("the issue under test is not tolerated by the step", options: expected) {
            let result = AppLifecycle.tolerating(true) { XCTFail("app.fivvi.pro crashed at launch") }
            XCTAssertEqual(result, AppLifecycle.StepResult(mayRepeat: false, tolerated: false))
        }
    }

    func test_F001N_aStepThatIsNotTolerantFailsAsBefore() {
        let expected = XCTExpectedFailure.Options()
        expected.issueMatcher = { $0.compactDescription.contains("Failed to terminate") }

        XCTExpectFailure("the last try is not tolerated", options: expected) {
            let result = AppLifecycle.tolerating(false) { XCTFail("Failed to terminate app.fivvi.pro:0") }
            XCTAssertEqual(result, AppLifecycle.StepResult())
        }
    }

    func test_F001N_onlyTheFirstStepOfATestIsDoneAgain() {
        XCTAssertEqual(AppLifecycle.attemptsForNextStep(), 2)

        AppLifecycle.report("stopping")(2, 2) // a step is done again: the test has used its repeat
        XCTAssertEqual(AppLifecycle.attemptsForNextStep(), 1)

        AppLifecycle.startTest()
        XCTAssertEqual(AppLifecycle.attemptsForNextStep(), 2)
    }

    func test_F001N_aToleratedTimeoutThatTookEffectUsesTheRepeatUpToo() {
        AppLifecycle.reportTolerated("starting")(1, 2)
        XCTAssertEqual(AppLifecycle.attemptsForNextStep(), 1, "it cost the same wait, so a later step is done once")

        AppLifecycle.startTest()
    }

    /// The observer is what gives each test its repeat back, so a test case needs no setup of its own.
    func test_F001N_aTestStartingGivesItsRepeatBack_part1() {
        AppLifecycle.report("stopping")(2, 2)
        XCTAssertEqual(AppLifecycle.attemptsForNextStep(), 1)
    }

    func test_F001N_aTestStartingGivesItsRepeatBack_part2() {
        XCTAssertEqual(AppLifecycle.attemptsForNextStep(), 2, "a test that follows one that used its repeat")
    }
}

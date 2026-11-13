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

        var mayRepeat = true

        func step(tolerant: Bool) -> Bool {
            events.append(tolerant ? "step tolerant" : "step")
            return mayRepeat
        }
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

    func test_F001N_doesNotRepeatAStepThatRecordedAnIssueThatIsNotTolerable() {
        let steps = Steps(done: [false, true])
        steps.mayRepeat = false

        XCTAssertNil(run(steps, attempts: 2), "an app that crashed at launch is a failure of the first try")
        XCTAssertEqual(steps.events, ["step tolerant", "check"])
    }

    func test_F001N_warningNamesTheStepForCI() {
        XCTAssertEqual(
            AppLifecycle.warning(step: "stopping", attempt: 2, of: 2),
            "::warning::flaky: XCTest could not finish stopping the app, doing it again (try 2 of 2)"
        )
    }

    // MARK: the issues of XCTest's own lifecycle steps

    /// What the tests below that need to know whether the test went on after a tolerated step read in `tearDown`,
    /// which runs when the test was stopped as well (a test that stops early reports no failure of its own).
    private var wentOn = false
    private var mustHaveGoneOn: Bool?

    override func setUp() {
        super.setUp()
        wentOn = false
        mustHaveGoneOn = nil
        AppLifecycle.testCase = self
    }

    override func tearDown() {
        if let mustHaveGoneOn {
            XCTAssertEqual(wentOn, mustHaveGoneOn, "did the test go on after the tolerated step")
        }
        AppLifecycle.testCase = nil
        super.tearDown()
    }

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

    /// Every UI test case sets `continueAfterFailure = false`, and then an issue that is expected stops the test as a
    /// failure would, so the repeat never ran and the test reported it passed (a failure turned green).
    func test_F001N_aToleratedStepDoesNotStopTheTest() {
        continueAfterFailure = false
        mustHaveGoneOn = true

        let clean = AppLifecycle.tolerating(true) { XCTFail("Failed to terminate app.fivvi.pro:0") }
        wentOn = true

        XCTAssertTrue(clean)
        XCTAssertFalse(continueAfterFailure, "the test case is as it was")
    }

    func test_F001N_aToleratedStepThatRecordsNothingIsNoFailure() {
        continueAfterFailure = false
        mustHaveGoneOn = true

        XCTAssertTrue(AppLifecycle.tolerating(true) {})
        wentOn = true
    }

    func test_F001N_anIssueThatIsNotTolerableStopsTheTestOnTheFirstTry() {
        continueAfterFailure = false
        mustHaveGoneOn = false
        let expected = XCTExpectedFailure.Options()
        expected.issueMatcher = { $0.compactDescription.contains("crashed at launch") }

        // The crash is an expected failure of this test only, so that the test itself can pass.
        XCTExpectFailure("the issue under test is not tolerated by the step", options: expected) {
            let clean = AppLifecycle.tolerating(true) { XCTFail("app.fivvi.pro crashed at launch") }
            wentOn = true // never reached: the issue stops the test, as continueAfterFailure says
            XCTAssertFalse(clean)
        }
    }

    func test_F001N_aStepThatIsNotTolerantFailsAsBefore() {
        continueAfterFailure = false
        mustHaveGoneOn = false
        let expected = XCTExpectedFailure.Options()
        expected.issueMatcher = { $0.compactDescription.contains("Failed to terminate") }

        XCTExpectFailure("the last try is not tolerated", options: expected) {
            AppLifecycle.tolerating(false) { XCTFail("Failed to terminate app.fivvi.pro:0") }
            wentOn = true
        }
    }

    func test_F001N_onlyTheFirstStepOfATestIsDoneAgain() {
        XCTAssertEqual(AppLifecycle.attemptsForNextStep(), 2)

        AppLifecycle.report("stopping")(2, 2) // a step is done again: the test has used its repeat
        XCTAssertEqual(AppLifecycle.attemptsForNextStep(), 1)

        AppLifecycle.testCase = self // a new test: the repeat is back
        XCTAssertEqual(AppLifecycle.attemptsForNextStep(), 2)
    }
}

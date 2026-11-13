import XCTest

/// The steps that stop and start the app, which XCTest fails on its own when a loaded CI simulator is slow, with no
/// assertion of the test failing (#1291): "Failed to terminate app.fivvi.pro" after a 60 s wait, in the terminate step
/// `launch()` does first when the previous test left its app running, and "Failed to get background assertion for
/// target app ... Timed out" in the launch itself. The app is fine on a second go, so the test must not fail on the first.
///
/// A step runs again when it didn't take effect (the app is still running after a terminate, not running after a
/// launch). Only the two lifecycle messages XCTest records inside a step that is going to be repeated are tolerated (a
/// non-strict `XCTExpectFailure` with an issue matcher); any other issue (an app that crashes at launch) fails the test
/// on the first try, and so does the last try, so a step that never works fails the test with XCTest's own message, as
/// it did before.
///
/// A tolerated try must not stop the test, and every UI test case stops on an issue (`continueAfterFailure = false`),
/// even an expected one. So the try runs with that switched on, and off again after; the test case is the one that
/// called `AppLifecycle.testCase = self` in its `setUp`.
///
/// A step that times out takes about 60 s and a test has 120 s (up to 180 s, `scripts/test-ios.sh`), so a test gets one
/// repeat in all (`repeatsLeft`): the first step that has to be done again, a stop or a start, is; any later one is done
/// once and fails as before. Every repeated step is an activity of the test (`warning`), which CI reports as flaky
/// (`TESTING.md §8`).
@MainActor
enum AppLifecycle {
    /// How many times a step is done at most, while the test still has a repeat left (`repeatsLeft`).
    static let attempts = 2

    /// How long the app may take to show it stopped, after `terminate()` returned.
    static let settleTimeout: TimeInterval = 5

    /// The issues XCTest records itself in a step that timed out: the only ones a tolerated try lets through. An app
    /// that crashes at launch, or any other failure of the step, fails the test on the first try.
    static let tolerableMessages = ["Failed to terminate", "Failed to get background assertion"]

    /// The test case that is running, which a tolerated try needs (see above). Set in the `setUp` of the base class of
    /// the UI tests; setting it gives the test its one repeat back.
    static weak var testCase: XCTestCase? {
        didSet { repeatsLeft = 1 }
    }

    /// A step that timed out takes about 60 s and a test has 120 s (up to 180 s), so only the first step of a test that
    /// times out is done again; a later one is done once, and fails the test as it did before.
    private(set) static var repeatsLeft = 1

    /// The number of tries the next step gets.
    static func attemptsForNextStep() -> Int {
        repeatsLeft > 0 ? attempts : 1
    }

    /// Does `step` until `isDone` holds, at most `attempts` times. `step` is told whether its failures may be
    /// tolerated (every try but the last) and returns whether the step may be done again (false when it recorded an
    /// issue that is not tolerable). `report(attempt, attempts)` runs just before a repeated step. Returns the number
    /// of the try after which `isDone` held, or nil when none did.
    @discardableResult
    static func perform(
        attempts: Int,
        step: (_ tolerant: Bool) -> Bool,
        isDone: () -> Bool,
        report: (_ attempt: Int, _ of: Int) -> Void = { _, _ in }
    ) -> Int? {
        for attempt in 1...max(attempts, 1) {
            let isLast = attempt >= attempts
            let mayRepeat = step(!isLast)
            if isDone() { return attempt }
            guard !isLast, mayRepeat else { return nil }
            report(attempt + 1, attempts)
        }
        return nil
    }

    /// The title of the activity a repeated step leaves in the test's result; `scripts/test-ios.sh` shows the
    /// activities that start with `::warning::flaky` as warnings and in the job summary (`ReachableLaunch.warning`).
    static func warning(step: String, attempt: Int, of attempts: Int) -> String {
        "::warning::flaky: XCTest could not finish \(step) the app, doing it again (try \(attempt) of \(attempts))"
    }

    /// Stops `app` if it is running (the previous test's app, or the first start that did not answer), so the next
    /// `launch()` has no terminate step of its own to time out in.
    static func stop(_ app: XCUIApplication) {
        guard app.state != .notRunning else { return }
        perform(
            attempts: attemptsForNextStep(),
            step: { tolerant in tolerating(tolerant) { app.terminate() } },
            isDone: { Polling.until(timeout: settleTimeout, interval: 0.25) { app.state == .notRunning } },
            report: report("stopping")
        )
    }

    /// Launches `app`, again when it is not running afterwards.
    static func start(_ app: XCUIApplication) {
        perform(
            attempts: attemptsForNextStep(),
            step: { tolerant in tolerating(tolerant) { app.launch() } },
            isDone: { app.state != .notRunning },
            report: report("starting")
        )
    }

    static func report(_ step: String) -> (Int, Int) -> Void {
        { attempt, total in
            repeatsLeft -= 1
            XCTContext.runActivity(named: warning(step: step, attempt: attempt, of: total)) { _ in }
        }
    }

    /// Whether XCTest's own lifecycle message may be let through.
    static func isTolerable(_ issue: XCTIssue) -> Bool {
        tolerableMessages.contains { issue.compactDescription.contains($0) }
    }

    /// Runs `body`; when `tolerant`, the tolerable issues it records are expected failures, and it is no failure when
    /// it records none (non-strict). Any other issue is recorded as the failure it is, with the test case's
    /// `continueAfterFailure` as it was, so the test stops there. Returns false when such an issue was recorded.
    @discardableResult
    static func tolerating(
        _ tolerant: Bool,
        in testCase: XCTestCase? = AppLifecycle.testCase,
        _ body: () -> Void
    ) -> Bool {
        guard tolerant else {
            body()
            return true
        }
        let continues = testCase?.continueAfterFailure
        var clean = true
        let options = XCTExpectedFailure.Options()
        options.isStrict = false
        options.issueMatcher = { issue in
            guard isTolerable(issue) else {
                clean = false
                if let continues { testCase?.continueAfterFailure = continues }
                return false
            }
            return true
        }
        // An expected failure stops a test whose `continueAfterFailure` is false, like a real one, and the repeat would
        // never run; so a tolerated try goes on, until the issue matcher sees one that is not tolerable.
        testCase?.continueAfterFailure = true
        defer { if let continues { testCase?.continueAfterFailure = continues } }
        XCTExpectFailure(
            "a slow simulator may time out XCTest's app step (#1291)", options: options, failingBlock: body
        )
        return clean
    }
}

import XCTest

/// The steps that stop and start the app, which XCTest fails on its own when a loaded CI simulator is slow, with no
/// assertion of the test failing (#1291): "Failed to terminate app.fivvi.pro" after a 60 s wait, in the terminate step
/// `launch()` does first when the previous test left its app running, and "Failed to get background assertion for
/// target app ... Timed out" in the launch itself. The app is fine on a second go, so the test must not fail on the first.
///
/// A step runs again when it didn't take effect (the app is still running after a terminate, not running after a
/// launch). Only the issues XCTest records inside a step that is going to be repeated are tolerated (a non-strict
/// `XCTExpectFailure`); the last try is not, so a step that never works fails the test with XCTest's own message, as it
/// did before. Every repeated step is an activity of the test (`warning`), which CI reports as flaky (`TESTING.md §8`).
@MainActor
enum AppLifecycle {
    /// How many times a step is done. A step that times out takes about 60 s and a test has 120 s (up to 180 s), so a
    /// third try can't fit.
    static let attempts = 2

    /// How long the app may take to show it stopped, after `terminate()` returned.
    static let settleTimeout: TimeInterval = 5

    /// Does `step` until `isDone` holds, at most `attempts` times. `step` is told whether its failures may be
    /// tolerated: every try but the last. `report(attempt, attempts)` runs just before a repeated step. Returns the
    /// number of the try after which `isDone` held, or nil when none did.
    @discardableResult
    static func perform(
        attempts: Int,
        step: (_ tolerant: Bool) -> Void,
        isDone: () -> Bool,
        report: (_ attempt: Int, _ of: Int) -> Void = { _, _ in }
    ) -> Int? {
        for attempt in 1...max(attempts, 1) {
            let isLast = attempt >= attempts
            step(!isLast)
            if isDone() { return attempt }
            if !isLast { report(attempt + 1, attempts) }
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
            attempts: attempts,
            step: { tolerant in tolerating(tolerant) { app.terminate() } },
            isDone: { Polling.until(timeout: settleTimeout, interval: 0.25) { app.state == .notRunning } },
            report: report("stopping")
        )
    }

    /// Launches `app`, again when it is not running afterwards.
    static func start(_ app: XCUIApplication) {
        perform(
            attempts: attempts,
            step: { tolerant in tolerating(tolerant) { app.launch() } },
            isDone: { app.state != .notRunning },
            report: report("starting")
        )
    }

    private static func report(_ step: String) -> (Int, Int) -> Void {
        { attempt, total in
            XCTContext.runActivity(named: warning(step: step, attempt: attempt, of: total)) { _ in }
        }
    }

    /// Runs `body`; when `tolerant`, the issues it records are expected failures, and it is no failure when it records
    /// none (non-strict).
    private static func tolerating(_ tolerant: Bool, _ body: () -> Void) {
        guard tolerant else { return body() }
        let options = XCTExpectedFailure.Options()
        options.isStrict = false
        XCTExpectFailure("a slow simulator may time out XCTest's own app step (#1291)", options: options, failingBlock: body)
    }
}

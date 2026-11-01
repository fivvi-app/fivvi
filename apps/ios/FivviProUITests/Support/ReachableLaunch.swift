import XCTest

/// Starts the app and checks that UI tests can read it; when they can't, starts it again (#388).
///
/// On a slow CI simulator the first start of a test can leave the app running without an accessibility server: XCTest
/// waits its 60 s for the app to idle, then every query fails with `kAXErrorServerNotFound` ("Error getting main
/// window"), whatever the test does. The app is fine on a second start, so the test must not fail on the first.
enum ReachableLaunch {
    /// How many times the app is started before the test goes on with whatever it has. A start on a slow runner took
    /// 66 s plus the probe, and a test has 120 s, so a third start can't fit.
    static let attempts = 2

    /// How long the accessibility hierarchy of a started app may take to answer. An app that is going to answer does
    /// so within a second or two; waiting longer only eats the time of the second start.
    static let probeTimeout: TimeInterval = 5

    /// Runs `launch` and `isReachable`; when the app is running but doesn't answer, `report` the start about to
    /// happen, `terminate` and again, at most `attempts` times. An app that is not running (it crashed at start) is
    /// not started again: that is a bug of the app, and the test must fail on it. Returns the number of the attempt
    /// that answered, or nil when none did (the app is then left as it is, so the test fails on its own query as it
    /// would without this).
    static func launch(
        attempts: Int,
        launch: () -> Void,
        isReachable: () -> Bool,
        isRunning: () -> Bool,
        terminate: () -> Void,
        report: (_ attempt: Int, _ of: Int) -> Void = { _, _ in }
    ) -> Int? {
        for attempt in 1...attempts {
            launch()
            if isReachable() { return attempt }
            guard attempt < attempts, isRunning() else { return nil }
            report(attempt + 1, attempts)
            terminate()
        }
        return nil
    }

    /// The title of the activity a repeated start leaves in the test's result. `scripts/test-ios.sh` reads the
    /// activities that start with `::warning::flaky` from the result bundle and shows them as `::warning::` lines and in
    /// the job summary: a test that only passes on a retry is reported as flaky (`TESTING.md §8`).
    static func warning(attempt: Int, of attempts: Int) -> String {
        "::warning::flaky: app unreadable after start, starting it again (start \(attempt) of \(attempts))"
    }

    /// Launches `app` until its accessibility hierarchy can be read. The probe is `snapshot()`, which throws instead of
    /// failing the test when the app can't be read. Every repeated start is an activity of the test (in its result),
    /// which is how CI finds it: `xcodebuild -quiet` drops what a test prints.
    @MainActor
    @discardableResult
    static func launch(_ app: XCUIApplication) -> Int? {
        launch(
            attempts: attempts,
            launch: { app.launch() },
            isReachable: { Polling.until(timeout: probeTimeout, interval: 0.5) { (try? app.snapshot()) != nil } },
            isRunning: { app.state != .notRunning },
            terminate: { app.terminate() },
            report: { attempt, total in
                XCTContext.runActivity(named: warning(attempt: attempt, of: total)) { _ in }
            }
        )
    }
}

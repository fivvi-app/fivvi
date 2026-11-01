import XCTest

/// Starts the app and checks that UI tests can read it; when they can't, starts it again (#388).
///
/// On a slow CI simulator the first start of a test can leave the app running without an accessibility server: XCTest
/// waits its 60 s for the app to idle, then every query fails with `kAXErrorServerNotFound` ("Error getting main
/// window"), whatever the test does. The app is fine on a second start, so the test must not fail on the first.
enum ReachableLaunch {
    /// How many times the app is started before the test goes on with whatever it has.
    static let attempts = 3

    /// How long the accessibility hierarchy of a started app may take to answer.
    static let probeTimeout: TimeInterval = 15

    /// Runs `launch` and `isReachable`; when the app doesn't answer, `terminate` and again, at most `attempts` times.
    /// Returns the number of the attempt that answered, or nil when none did (the app is then left running, so the
    /// test fails on its own query as it would without this).
    static func launch(
        attempts: Int, launch: () -> Void, isReachable: () -> Bool, terminate: () -> Void
    ) -> Int? {
        for attempt in 1...attempts {
            launch()
            if isReachable() { return attempt }
            if attempt < attempts { terminate() }
        }
        return nil
    }

    /// Launches `app` until its accessibility hierarchy can be read. The probe is `snapshot()`, which throws instead of
    /// failing the test when the app can't be read.
    @MainActor
    @discardableResult
    static func launch(_ app: XCUIApplication) -> Int? {
        launch(
            attempts: attempts,
            launch: { app.launch() },
            isReachable: { Polling.until(timeout: probeTimeout, interval: 0.5) { (try? app.snapshot()) != nil } },
            terminate: { app.terminate() }
        )
    }
}

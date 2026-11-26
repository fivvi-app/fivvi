import XCTest

extension XCTestCase {
    /// Lets the main run loop turn for `seconds`, so SwiftUI lays out and draws what a test hosted.
    func settle(_ seconds: TimeInterval = 1.5) {
        RunLoop.main.run(until: Date(timeIntervalSinceNow: seconds))
    }

    /// Runs the main loop until `done` holds (up to 20 s), so a slow first layout of a run doesn't fail the test and a
    /// fast one doesn't wait: a condition, not a fixed pause.
    func settle(until done: () -> Bool) {
        for _ in 0 ..< 40 where !done() { settle(0.5) }
    }
}

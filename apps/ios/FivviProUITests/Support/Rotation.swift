import CoreGraphics
import XCTest

/// Turning the device in a UI test and waiting for the app to follow (#1305). `XCUIDevice.shared.orientation = …`
/// returns before the app's window has turned, and on a loaded simulator the app can come up in the old orientation and
/// turn a moment later, or not at all until the device is turned again. A test that reads the window at once sees the
/// old shape and fails on a state it did not wait for.
enum Rotation {
    /// Whether a window of `frame` is laid out for `orientation`: wider than high in landscape, otherwise not. A window
    /// that is not there yet (no frame) is laid out for none.
    static func isApplied(_ orientation: UIDeviceOrientation, to frame: CGRect) -> Bool {
        !frame.isEmpty && (frame.width > frame.height) == orientation.isLandscape
    }

    /// Turns the device to `orientation` and waits up to `timeout` seconds for the window (`window` reads its frame) to
    /// follow. When it did not, turns the device again, at most `attempts` times in all, each with the whole `timeout`
    /// (the same bound `Polling.acting` gives a repeated tap). A repeat goes through the other orientation, because
    /// turning a device to the orientation it is already in does nothing. `report(attempt, attempts)` runs just before
    /// every repeat: a rotation that needs a second try is a flaky test and must show as one (`TESTING.md §8`).
    /// `now` and `wait` are as in `Polling.until`.
    static func apply(
        _ orientation: UIDeviceOrientation,
        attempts: Int = 2,
        timeout: TimeInterval,
        interval: TimeInterval = 0.05,
        now: () -> Date = Date.init,
        wait: (TimeInterval) -> Void = { RunLoop.current.run(until: Date().addingTimeInterval($0)) },
        window: () -> CGRect,
        rotate: (UIDeviceOrientation) -> Void,
        report: (_ attempt: Int, _ attempts: Int) -> Void
    ) -> Bool {
        var turns = 0
        return Polling.acting(
            attempts: attempts, timeout: timeout, interval: interval, now: now, wait: wait,
            action: {
                turns += 1
                if turns > 1 { rotate(orientation.isLandscape ? .portrait : .landscapeLeft) }
                rotate(orientation)
            },
            canRepeat: { true }, report: report,
            until: { isApplied(orientation, to: window()) }
        )
    }

    /// The title of the activity a repeated rotation leaves in the test's result, which `scripts/test-ios.sh` reports
    /// as flaky like a repeated tap (`Polling.warning`).
    static func warning(_ orientation: UIDeviceOrientation, attempt: Int, of attempts: Int) -> String {
        "::warning::flaky: the app did not follow the rotation to \(orientation), rotating again "
            + "(rotation \(attempt) of \(attempts))"
    }
}

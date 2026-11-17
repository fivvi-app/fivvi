import CoreGraphics
import XCTest

/// The wait for the app to follow a rotation of the device (#1305), on a clock the test moves.
final class RotationTests: XCTestCase {
    private let portrait = CGRect(x: 0, y: 0, width: 393, height: 852)
    private let landscape = CGRect(x: 0, y: 0, width: 852, height: 393)

    /// A clock that only moves when `Polling` waits, so nothing here sleeps.
    private final class Clock {
        private(set) var now = Date(timeIntervalSince1970: 0)

        func wait(_ seconds: TimeInterval) {
            now = now.addingTimeInterval(seconds)
        }
    }

    func test_E008_aWindowWiderThanHighIsLandscapeAndTheOtherWayRoundIsPortrait() {
        XCTAssertTrue(Rotation.isApplied(.landscapeLeft, to: landscape))
        XCTAssertTrue(Rotation.isApplied(.landscapeRight, to: landscape))
        XCTAssertTrue(Rotation.isApplied(.portrait, to: portrait))
        XCTAssertFalse(Rotation.isApplied(.landscapeLeft, to: portrait))
        XCTAssertFalse(Rotation.isApplied(.portrait, to: landscape))
        XCTAssertFalse(Rotation.isApplied(.portrait, to: .zero), "no window yet is not an upright one")
        XCTAssertFalse(Rotation.isApplied(.landscapeLeft, to: .zero))
    }

    func test_E008_theAppThatTurnsAfterTheLaunchIsWaitedFor() {
        // The failure of #1305: the window was still upright when the test read it, a moment before it turned.
        let clock = Clock()
        var reads = 0
        var rotations: [UIDeviceOrientation] = []

        let turned = Rotation.apply(
            .landscapeLeft, timeout: 10, now: { clock.now }, wait: clock.wait,
            window: {
                reads += 1
                return reads < 4 ? self.portrait : self.landscape
            },
            rotate: { rotations.append($0) }, report: { _, _ in XCTFail("it turned by itself, nothing to do again") }
        )

        XCTAssertTrue(turned)
        XCTAssertEqual(rotations, [.landscapeLeft], "the device is turned once")
    }

    func test_E008_anAppThatDidNotTurnIsTurnedAgainFromTheOtherSide() {
        let clock = Clock()
        var rotations: [UIDeviceOrientation] = []
        var reports: [(Int, Int)] = []

        let turned = Rotation.apply(
            .landscapeLeft, timeout: 10, now: { clock.now }, wait: clock.wait,
            window: { rotations.count < 3 ? self.portrait : self.landscape },
            rotate: { rotations.append($0) }, report: { reports.append(($0, $1)) }
        )

        XCTAssertTrue(turned)
        XCTAssertEqual(
            rotations, [.landscapeLeft, .portrait, .landscapeLeft], "a repeat is a new rotation, not the old one"
        )
        XCTAssertEqual(reports.map(\.0), [2])
        XCTAssertEqual(reports.map(\.1), [2])
    }

    func test_E008_anAppThatNeverTurnsFailsAfterTheTimeoutOfEveryTry() {
        let clock = Clock()

        let turned = Rotation.apply(
            .landscapeLeft, timeout: 10, now: { clock.now }, wait: clock.wait,
            window: { self.portrait }, rotate: { _ in }, report: { _, _ in }
        )

        XCTAssertFalse(turned)
        XCTAssertGreaterThanOrEqual(clock.now.timeIntervalSince1970, 20, "both tries had the whole timeout")
    }
}

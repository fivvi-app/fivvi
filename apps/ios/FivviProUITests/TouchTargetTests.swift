import CoreGraphics
import XCTest

/// The touch-target check the UI tests use (#78): element frames are in points, laid out on whole device pixels.
final class TouchTargetTests: XCTestCase {
    func test_E008_AC4_exactly44PointsAtThreeTimesMeetsTheTarget() {
        // The retry button on an iPhone 18 Pro Max: 132 × 132 px, which XCTest reports with floating-point error.
        let size = CGSize(width: 43.99999999999994, height: 43.99999999999994)

        XCTAssertTrue(TouchTarget.isMet(by: size, scale: 3))
    }

    func test_E008_AC4_44PointsMeetsTheTarget() {
        XCTAssertTrue(TouchTarget.isMet(by: CGSize(width: 44, height: 44), scale: 2))
        XCTAssertTrue(TouchTarget.isMet(by: CGSize(width: 200, height: 52), scale: 3))
    }

    func test_E008_AC4_smallButtonMissesTheTarget() {
        XCTAssertFalse(TouchTarget.isMet(by: CGSize(width: 40, height: 40), scale: 3))
        XCTAssertFalse(TouchTarget.isMet(by: CGSize(width: 200, height: 40), scale: 2))
        XCTAssertFalse(TouchTarget.isMet(by: CGSize(width: 40, height: 200), scale: 3))
    }

    func test_E008_AC4_onePixelShortMissesTheTarget() {
        // 131 px at 3x and 87 px at 2x.
        XCTAssertFalse(TouchTarget.isMet(by: CGSize(width: 200, height: 131.0 / 3), scale: 3))
        XCTAssertFalse(TouchTarget.isMet(by: CGSize(width: 87.0 / 2, height: 200), scale: 2))
    }
}

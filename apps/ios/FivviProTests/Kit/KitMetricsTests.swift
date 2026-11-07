import SwiftUI
import XCTest
import FivviDesignTokens

@testable import FivviPro

/// E020: the names and sizes the kit takes from the decisions of `docs/design/prototype-v2/DECISIONS.md` §2. What the
/// blocks look like drawn is checked in `KitRenderedTests`; how they behave on a screen in `KitGalleryUITests`.
final class KitMetricsTests: XCTestCase {
    func test_E020_AC14_aToastShowsAWarningIconForAnErrorAndACheckForSuccess() {
        XCTAssertEqual(ToastKind.warning.systemImage, "exclamationmark.triangle.fill")
        XCTAssertEqual(ToastKind.success.systemImage, "checkmark.circle.fill")
    }

    func test_E020_AC14_aFieldWithAnErrorIsMarkedWithAWarningIcon() {
        XCTAssertEqual(FieldErrorStyle.systemImage, "exclamationmark.triangle.fill")
    }

    /// E020 AC6: Open Gym comes later; no kit component offers its colours.
    func test_E020_AC6_noKitComponentOffersOpenGym() {
        XCTAssertEqual(NextCardTone.allCases.count, 3)
    }

    func test_E020_AC8_largeTitlesAre34Points() {
        let large = UITraitCollection(preferredContentSizeCategory: .large)
        XCTAssertEqual(Tokens.TextStyle.display, .largeTitle)
        XCTAssertEqual(UIFont.preferredFont(forTextStyle: .largeTitle, compatibleWith: large).pointSize, 34)
    }
}

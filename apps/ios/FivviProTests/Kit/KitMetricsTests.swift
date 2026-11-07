import SwiftUI
import XCTest
import FivviDesignTokens

@testable import FivviPro

/// E020 AC14: the sizes, shapes and colours of the building blocks come from the design tokens and the decisions of
/// `docs/design/prototype-v2/DECISIONS.md` §2. What a person sees of them is checked in `KitGalleryUITests`.
final class KitMetricsTests: XCTestCase {
    func test_E020_AC14_cardsAndListsHaveRadius26() {
        XCTAssertEqual(Tokens.Radius.card, 26)
        XCTAssertEqual(CardStyle.radius, Tokens.Radius.card)
        XCTAssertEqual(InsetGroupStyle.radius, Tokens.Radius.card)
    }

    func test_E020_AC14_pillButtonsAre50PointsAndStackAt48With10Between() {
        XCTAssertEqual(PillButtonMetrics.height, 50)
        XCTAssertEqual(PillButtonMetrics.stackedHeight, 48)
        XCTAssertEqual(PillButtonMetrics.stackedSpacing, 10)
    }

    func test_E020_AC14_aToastShowsAWarningIconForAnError() {
        XCTAssertEqual(ToastKind.warning.systemImage, "exclamationmark.triangle.fill")
        XCTAssertEqual(ToastKind.success.systemImage, "checkmark.circle.fill")
        XCTAssertNotEqual(ToastKind.warning.systemImage, ToastKind.success.systemImage)
    }

    func test_E020_AC14_aFieldWithAnErrorIsMarkedWithAWarningIcon() {
        XCTAssertEqual(FieldErrorStyle.systemImage, "exclamationmark.triangle.fill")
    }

    func test_E020_AC14_statusPillsUseTheStatusTints() {
        XCTAssertEqual(StatusPillKind.success.background, Tokens.Colors.statusSuccessBg)
        XCTAssertEqual(StatusPillKind.success.foreground, Tokens.Colors.statusSuccessText)
        XCTAssertEqual(StatusPillKind.danger.background, Tokens.Colors.statusDangerBg)
        XCTAssertEqual(StatusPillKind.danger.foreground, Tokens.Colors.statusDangerText)
        XCTAssertEqual(StatusPillKind.warning.background, Tokens.Colors.statusWarningBg)
        XCTAssertEqual(StatusPillKind.warning.foreground, Tokens.Colors.statusWarningText)
        XCTAssertEqual(StatusPillKind.neutral.background, Tokens.Colors.statusNeutralBg)
        XCTAssertEqual(StatusPillKind.neutral.foreground, Tokens.Colors.statusNeutralFg)
    }

    func test_E020_AC14_theNextCardStaysInOneHuePerTone() {
        XCTAssertEqual(
            NextCardTone.accent.gradient, [Tokens.Colors.accentGradientTop, Tokens.Colors.accentGradientBottom]
        )
        XCTAssertEqual(
            NextCardTone.privateSession.gradient,
            [Tokens.Colors.sessionPrivateGradientTop, Tokens.Colors.sessionPrivateGradientBottom]
        )
        XCTAssertEqual(
            NextCardTone.group.gradient,
            [Tokens.Colors.sessionGroupGradientTop, Tokens.Colors.sessionGroupGradientBottom]
        )
        XCTAssertEqual(NextCardTone.accent.text, Tokens.Colors.accentOn)
        XCTAssertEqual(NextCardTone.privateSession.text, Tokens.Colors.sessionPrivateOnSolid)
        XCTAssertEqual(NextCardTone.group.text, Tokens.Colors.sessionGroupOnSolid)
    }

    /// E020 AC6: Open Gym comes later; no kit component uses its colours.
    func test_E020_AC6_noKitComponentOffersOpenGym() {
        XCTAssertEqual(NextCardTone.allCases.count, 3)
    }

    func test_E020_AC8_largeTitlesAre34Points() {
        let large = UITraitCollection(preferredContentSizeCategory: .large)
        XCTAssertEqual(Tokens.TextStyle.display, .largeTitle)
        XCTAssertEqual(UIFont.preferredFont(forTextStyle: .largeTitle, compatibleWith: large).pointSize, 34)
    }
}

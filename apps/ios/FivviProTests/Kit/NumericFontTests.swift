import SwiftUI
import UIKit
import XCTest
import FivviDesignTokens

@testable import FivviPro
@testable import FivviUI

/// E020 AC11: numbers are set in the rounded face with tabular digits (SF Pro Rounded on iOS).
@MainActor
final class NumericFontTests: XCTestCase {
    /// How wide `text` is when set in `font`, in points, at the default text size.
    private func width(of text: String, in font: Font) -> CGFloat {
        let host = UIHostingController(rootView: Text(text).font(font).fixedSize())
        host.view.frame = CGRect(x: 0, y: 0, width: 2000, height: 200)
        return host.sizeThatFits(in: CGSize(width: 2000, height: 200)).width
    }

    func test_E020_AC11_roundedTabularNumbers() {
        let numeric = NumericFont.font()
        // Tabular: every digit takes the same width, so a column of numbers lines up.
        let widths = ["0000", "1111", "4444", "8888"].map { width(of: $0, in: numeric) }
        XCTAssertEqual(Set(widths).count, 1, "digits are tabular: \(widths)")
        // Rounded: the letters are drawn in the rounded design, not the system's default one.
        let plain = Font.system(Tokens.TextStyle.body, weight: .semibold)
        XCTAssertNotEqual(
            width(of: "Fivvi Pro", in: numeric), width(of: "Fivvi Pro", in: plain),
            "the numeric face is the rounded design"
        )
    }

    func test_E020_AC11_followsDynamicType() {
        let widthAt = { (size: DynamicTypeSize) -> CGFloat in
            let time = "12:30"
            let host = UIHostingController(
                rootView: Text(time).font(NumericFont.font()).dynamicTypeSize(size).fixedSize()
            )
            return host.sizeThatFits(in: CGSize(width: 2000, height: 400)).width
        }
        XCTAssertGreaterThan(widthAt(.accessibility3), widthAt(.small), "numbers grow with the text size")
    }
}

import SwiftUI
import FivviDesignTokens

/// The face for numbers (E020 AC11, `font.family.numeric`): SF Pro Rounded with tabular digits, so a column of times,
/// counts or prices lines up. It is the system's rounded design, scaled by Dynamic Type like any text style, not a
/// bundled font. Text that isn't a number keeps the system face.
enum NumericFont {
    /// The numeric face at a text style (the body size by default).
    static func font(_ style: Font.TextStyle = Tokens.TextStyle.body, weight: Font.Weight = .semibold) -> Font {
        .system(style, design: .rounded, weight: weight).monospacedDigit()
    }
}

extension View {
    /// Sets the view's text in the numeric face.
    func numericFont(_ style: Font.TextStyle = Tokens.TextStyle.body, weight: Font.Weight = .semibold) -> some View {
        font(NumericFont.font(style, weight: weight))
    }
}

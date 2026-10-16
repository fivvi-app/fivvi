import SwiftUI
import TrainerHubDesignTokens

/// The screen's one primary action: a filled pill in the design tokens' primary colours, the `label` text style and
/// at least a 44 pt touch target (HIG). At accessibility text sizes the label wraps onto more lines, so the pill
/// becomes a rounded rectangle that keeps every line inside the fill.
struct PrimaryButtonStyle: ButtonStyle {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    func makeBody(configuration: Configuration) -> some View {
        let shape = dynamicTypeSize.isAccessibilitySize
            ? AnyShape(RoundedRectangle(cornerRadius: Tokens.Radius.lg, style: .continuous))
            : AnyShape(Capsule(style: .continuous))
        configuration.label
            .font(.system(Tokens.TextStyle.label, weight: .semibold))
            .foregroundStyle(Tokens.Colors.actionPrimaryFg)
            .padding(.horizontal, Tokens.Spacing.space5)
            .padding(.vertical, Tokens.Spacing.space3)
            .frame(minWidth: 44, minHeight: 44)
            .background(
                configuration.isPressed ? Tokens.Colors.actionPrimaryBgPressed : Tokens.Colors.actionPrimaryBg,
                in: shape
            )
            .contentShape(shape)
    }
}

extension ButtonStyle where Self == PrimaryButtonStyle {
    /// The screen's one primary action, in the design tokens' colours.
    static var primary: PrimaryButtonStyle { PrimaryButtonStyle() }
}

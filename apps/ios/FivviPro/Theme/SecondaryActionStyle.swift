import SwiftUI
import FivviDesignTokens

/// A secondary action next to the screen's primary one (resend the code, change the address, sign out): a tonal pill in
/// the design tokens' tonal colours, the `label` text style and at least a 44 pt touch target (HIG). Like the primary
/// action, its label wraps at accessibility text sizes and the pill becomes a rounded rectangle around every line.
struct SecondaryActionStyle: ButtonStyle {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        let shape = dynamicTypeSize.isAccessibilitySize
            ? AnyShape(RoundedRectangle(cornerRadius: Tokens.Radius.lg, style: .continuous))
            : AnyShape(Capsule(style: .continuous))
        configuration.label
            .font(.system(Tokens.TextStyle.label, weight: .semibold))
            .foregroundStyle(Tokens.Colors.actionTonalFg)
            .padding(.horizontal, Tokens.Spacing.space5)
            .padding(.vertical, Tokens.Spacing.space3)
            .frame(minWidth: 44, minHeight: 44)
            .background(Tokens.Colors.actionTonalBg.opacity(configuration.isPressed ? 0.7 : 1), in: shape)
            .opacity(isEnabled ? 1 : 0.5)
            .contentShape(shape)
    }
}

extension ButtonStyle where Self == SecondaryActionStyle {
    /// A secondary action, in the design tokens' tonal colours.
    static var secondaryAction: SecondaryActionStyle { SecondaryActionStyle() }
}

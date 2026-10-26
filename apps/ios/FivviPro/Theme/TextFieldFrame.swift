import SwiftUI
import FivviDesignTokens

extension View {
    /// A text field's frame in the design tokens: a surface with a control border, rounded, and at least a 44 pt touch
    /// target (HIG). Apply it to a `TextField` with the plain style, which stretches to the frame; the system's rounded
    /// border style keeps its own 34 pt height.
    func textFieldFrame() -> some View {
        let shape = RoundedRectangle(cornerRadius: Tokens.Radius.md, style: .continuous)
        return textFieldStyle(.plain)
            .padding(.horizontal, Tokens.Spacing.space3)
            .frame(minHeight: 44)
            .background(Tokens.Colors.bgSurface, in: shape)
            .overlay { shape.strokeBorder(Tokens.Colors.borderControl) }
    }
}

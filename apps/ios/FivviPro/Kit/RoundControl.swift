import SwiftUI
import FivviDesignTokens

/// A round control (E020 AC14), such as the + button: a circle with one symbol, drawn by the system's Liquid Glass
/// button styles, so it looks and behaves like the buttons of the navigation bar. `prominent` fills it with the accent.
/// It is at least 44 × 44 pt. `label` is its accessible name (a catalog text).
struct RoundControl: View {
    let systemImage: String
    let label: String
    var prominent = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(Tokens.TextStyle.title2, weight: .semibold))
                .frame(minWidth: 44, minHeight: 44)
        }
        .buttonBorderShape(.circle)
        .modifier(RoundControlStyle(prominent: prominent))
        .accessibilityLabel(label)
    }
}

private struct RoundControlStyle: ViewModifier {
    let prominent: Bool

    func body(content: Content) -> some View {
        if prominent {
            content.buttonStyle(.glassProminent).tint(Tokens.Colors.accentFill)
        } else {
            content.buttonStyle(.glass)
        }
    }
}

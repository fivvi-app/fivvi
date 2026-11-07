import SwiftUI
import FivviDesignTokens

enum RoundControlMetrics {
    /// A round control is a circle 44 pt across (the least a touch target is, HIG), on every iOS version.
    static let diameter: CGFloat = 44
}

/// A round control (E020 AC14), such as the + button: a circle with one symbol, drawn by the system's Liquid Glass
/// (`glassEffect`), so it looks and behaves like the buttons of the navigation bar. `prominent` tints it with the
/// accent. It is exactly 44 × 44 pt: the system's button styles add their own padding, which was wider than high
/// around a circle on iOS 26.2 (68 × 58 pt), so the size is set here. `label` is its accessible name (a catalog text).
struct RoundControl: View {
    let systemImage: String
    let label: String
    var prominent = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(Tokens.TextStyle.title2, weight: .semibold))
                .foregroundStyle(prominent ? Tokens.Colors.accentOn : Tokens.Colors.textPrimary)
                .frame(width: RoundControlMetrics.diameter, height: RoundControlMetrics.diameter)
                .glassEffect(glass, in: .circle)
        }
        .buttonStyle(.plain)
        .contentShape(.circle)
        .accessibilityLabel(label)
    }

    private var glass: Glass {
        prominent ? .regular.tint(Tokens.Colors.accentFill).interactive() : .regular.interactive()
    }
}

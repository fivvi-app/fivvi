import SwiftUI
import FivviDesignTokens

enum RoundControlMetrics {
    /// A round control is a circle 44 pt across at the default text size (the least a touch target is, HIG), on every
    /// iOS version. It grows with the text size, like the symbol in it.
    static let diameter: CGFloat = 44
}

/// A round control for the content (E020 AC14), such as the + button: a circle with one symbol. Not for a toolbar,
/// whose buttons the system draws itself. The regular kind is drawn by the system's Liquid Glass (`glassEffect`), so it
/// looks and behaves like the buttons of the navigation bar; `prominent` is a solid accent circle, as the prototype
/// draws it (`.gb.prom`), because the label colour `accentOn` is a contrast pair with the solid accent and a tinted
/// glass is translucent. It is 44 × 44 pt at the default text size and scales with the text (`@ScaledMetric`, with the
/// symbol), and stays round: the system's button styles add their own padding, which was wider than high around a
/// circle on iOS 26.2 (68 × 58 pt), so the size is set here. The touch shape is the circle (`contentShape` on the label); the system adds touch slop up to 44 pt, so a tap in the corner of the 44 pt square still counts. `label` is its accessible
/// name (a catalog text).
struct RoundControl: View {
    let systemImage: String
    let label: String
    var prominent = false
    let action: () -> Void
    @ScaledMetric(relativeTo: .title2) private var diameter = RoundControlMetrics.diameter

    var body: some View {
        Button(action: action) {
            surface
                .contentShape(.circle)
        }
        .buttonStyle(RoundControlPressStyle())
        .accessibilityLabel(label)
    }

    private var symbol: some View {
        Image(systemName: systemImage)
            .font(.system(Tokens.TextStyle.title2, weight: .semibold))
            .foregroundStyle(prominent ? Tokens.Colors.accentOn : Tokens.Colors.textPrimary)
            .frame(width: diameter, height: diameter)
    }

    @ViewBuilder private var surface: some View {
        if prominent {
            symbol
                .background(Circle().fill(Tokens.Colors.accentFill))
                .shadow(color: Tokens.Colors.accentFill.opacity(0.4), radius: 8, y: 6)
        } else {
            symbol.glassEffect(.regular.interactive(), in: .circle)
        }
    }
}

/// No style of its own: the label as it is, a little dimmer while it is pressed (glass reacts by itself).
private struct RoundControlPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.opacity(configuration.isPressed ? 0.8 : 1)
    }
}

import SwiftUI
import FivviDesignTokens

enum PillButtonMetrics {
    /// A pill button is 50 pt high (DECISIONS.md §2)...
    static let height: CGFloat = 50
    /// ...and keeps 48 pt when buttons are stacked, with 10 pt between them.
    static let stackedHeight: CGFloat = 48
    static let stackedSpacing: CGFloat = 10
}

enum PillButtonKind {
    /// The screen's one main action, filled with the accent.
    case filled
    /// A secondary action, on a tonal fill, in the accent's text colour.
    case tonal
    /// A destructive action, in the danger tint. Every removal still asks to confirm.
    case destructive
}

private struct PillButtonStackedKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    /// Whether pill buttons sit in a `PillButtonStack`: 48 pt high and as wide as the stack.
    fileprivate var pillButtonStacked: Bool {
        get { self[PillButtonStackedKey.self] }
        set { self[PillButtonStackedKey.self] = newValue }
    }
}

/// The pill button of the kit (E020 AC14): 50 pt high, the `body` text style in semibold, fully rounded. At the
/// accessibility text sizes the label wraps onto more lines and the pill becomes a rounded rectangle that keeps every
/// line inside its fill. Colours come from the tokens; white text only ever sits on the accent or the danger fill.
struct PillButtonStyle: ButtonStyle {
    var kind: PillButtonKind = .filled
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.pillButtonStacked) private var stacked

    func makeBody(configuration: Configuration) -> some View {
        let shape = dynamicTypeSize.isAccessibilitySize
            ? AnyShape(RoundedRectangle(cornerRadius: Tokens.Radius.lg, style: .continuous))
            : AnyShape(Capsule(style: .continuous))
        configuration.label
            .font(.system(Tokens.TextStyle.body, weight: .semibold))
            .foregroundStyle(foreground)
            .padding(.horizontal, Tokens.Spacing.space5)
            .padding(.vertical, Tokens.Spacing.space2)
            .frame(maxWidth: stacked ? .infinity : nil, minHeight: minHeight)
            .background(background(pressed: configuration.isPressed), in: shape)
            .opacity(isEnabled ? 1 : 0.4)
            .contentShape(shape)
    }

    private var minHeight: CGFloat {
        stacked ? PillButtonMetrics.stackedHeight : PillButtonMetrics.height
    }

    private var foreground: Color {
        switch kind {
        case .filled: Tokens.Colors.actionPrimaryFg
        case .tonal: Tokens.Colors.textLink
        case .destructive: Tokens.Colors.statusDangerText
        }
    }

    private func background(pressed: Bool) -> Color {
        switch kind {
        case .filled: pressed ? Tokens.Colors.actionPrimaryBgPressed : Tokens.Colors.actionPrimaryBg
        case .tonal: pressed ? Tokens.Colors.bgSubtle : Tokens.Colors.actionTonalBg
        case .destructive: Tokens.Colors.statusDangerBg
        }
    }
}

extension ButtonStyle where Self == PillButtonStyle {
    /// The kit's pill button.
    static func pill(_ kind: PillButtonKind = .filled) -> PillButtonStyle { PillButtonStyle(kind: kind) }
}

/// Pill buttons one under the other: each as wide as the stack, 48 pt high, with 10 pt between them.
struct PillButtonStack<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        VStack(spacing: PillButtonMetrics.stackedSpacing) {
            content
        }
        .environment(\.pillButtonStacked, true)
    }
}

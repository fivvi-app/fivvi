import SwiftUI
import FivviDesignTokens

public enum PillButtonMetrics {
    /// A pill button is 50 pt high (DECISIONS.md §2)...
    public static let height: CGFloat = 50
    /// ...and keeps 48 pt when buttons are stacked, with 10 pt between them.
    public static let stackedHeight: CGFloat = 48
    public static let stackedSpacing: CGFloat = 10
}

public enum PillButtonKind: Sendable {
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
public struct PillButtonStyle: ButtonStyle {
    public init(kind: PillButtonKind = .filled) { self.kind = kind }
    public var kind: PillButtonKind = .filled
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.pillButtonStacked) private var stacked

    public func makeBody(configuration: Configuration) -> some View {
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
    public static func pill(_ kind: PillButtonKind = .filled) -> PillButtonStyle { PillButtonStyle(kind: kind) }
}

/// Pill buttons one under the other: each as wide as the stack, 48 pt high, with 10 pt between them.
public struct PillButtonStack<Content: View>: View {
    public init(@ViewBuilder content: () -> Content) { self.content = content() }
    @ViewBuilder public let content: Content

    public var body: some View {
        VStack(spacing: PillButtonMetrics.stackedSpacing) {
            content
        }
        .environment(\.pillButtonStacked, true)
    }
}

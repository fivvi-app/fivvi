import SwiftUI
import FivviDesignTokens

public enum StatusPillKind: CaseIterable, Sendable {
    case neutral, success, warning, danger

    public var background: Color {
        switch self {
        case .neutral: Tokens.Colors.statusNeutralBg
        case .success: Tokens.Colors.statusSuccessBg
        case .warning: Tokens.Colors.statusWarningBg
        case .danger: Tokens.Colors.statusDangerBg
        }
    }

    /// The text colour on the tint: the status colour's own text token, never the solid colour.
    public var foreground: Color {
        switch self {
        case .neutral: Tokens.Colors.statusNeutralFg
        case .success: Tokens.Colors.statusSuccessText
        case .warning: Tokens.Colors.statusWarningText
        case .danger: Tokens.Colors.statusDangerText
        }
    }
}

/// A status pill (E020 AC14): a short label on a tint, such as *Aanwezig* or *3/8*. Digits are tabular.
public struct StatusPill: View {
    public init(text: String, kind: StatusPillKind = .neutral) {
        self.text = text
        self.kind = kind
    }
    public let text: String
    public var kind: StatusPillKind = .neutral

    public var body: some View {
        Text(text)
            .font(.system(Tokens.TextStyle.footnote, weight: .semibold))
            .monospacedDigit()
            .foregroundStyle(kind.foreground)
            .padding(.horizontal, 9)
            .padding(.vertical, 3)
            .background(kind.background, in: Capsule(style: .continuous))
            .fixedSize(horizontal: false, vertical: true)
    }
}

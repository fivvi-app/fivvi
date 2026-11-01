import SwiftUI
import FivviDesignTokens

/// A message on a clients screen: a rounded surface that wraps its text (a failed save, a confirmation, an offer).
struct ClientMessage: View {
    enum Kind {
        case error, success, info
    }

    let text: String
    let kind: Kind
    let id: String

    var body: some View {
        Text(text)
            .font(.system(Tokens.TextStyle.body))
            .foregroundStyle(foreground)
            .fixedSize(horizontal: false, vertical: true)
            .padding(Tokens.Spacing.space3)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(background, in: RoundedRectangle(cornerRadius: Tokens.Radius.md, style: .continuous))
            .accessibilityIdentifier(id)
    }

    private var foreground: Color {
        switch kind {
        case .error: Tokens.Colors.statusDangerFg
        case .success: Tokens.Colors.statusSuccessFg
        case .info: Tokens.Colors.statusNeutralFg
        }
    }

    private var background: Color {
        switch kind {
        case .error: Tokens.Colors.statusDangerBg
        case .success: Tokens.Colors.statusSuccessBg
        case .info: Tokens.Colors.statusNeutralBg
        }
    }
}

/// Grey rows in the shape of the list while it loads (`information-architecture.md §9.5`: skeleton rows, no spinner-only
/// screen). Read as one loading indicator by VoiceOver.
struct ClientSkeletonRows: View {
    let label: String
    let id: String

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Spacing.space4) {
            ForEach(0 ..< 6, id: \.self) { _ in
                VStack(alignment: .leading, spacing: Tokens.Spacing.space1) {
                    RoundedRectangle(cornerRadius: Tokens.Radius.sm, style: .continuous)
                        .fill(Tokens.Colors.bgSubtle)
                        .frame(width: 180, height: 16)
                    RoundedRectangle(cornerRadius: Tokens.Radius.sm, style: .continuous)
                        .fill(Tokens.Colors.bgSubtle)
                        .frame(width: 120, height: 12)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, Tokens.Spacing.space2)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
        .accessibilityIdentifier(id)
    }
}

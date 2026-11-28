import SwiftUI
import FivviDesignTokens

/// A message on a screen: a rounded surface that wraps its text (a failed save, a confirmation, an offer). `.accent` is
/// the prototype's banner: the accent mixed into the card, the text in the primary colour and, when given, an icon in the
/// accent (the substitution banner of TD-03, F024).
public struct StatusMessage: View {
    public enum Kind {
        case error, success, info, accent
    }

    let text: String
    let kind: Kind
    let id: String
    let systemImage: String?

    public init(text: String, kind: Kind, id: String, systemImage: String? = nil) {
        self.text = text
        self.kind = kind
        self.id = id
        self.systemImage = systemImage
    }

    public var body: some View {
        HStack(alignment: .top, spacing: Tokens.Spacing.space3) {
            if let systemImage {
                Image(systemName: systemImage)
                    .foregroundStyle(Tokens.Colors.accentText)
                    .accessibilityHidden(true)
            }
            Text(text)
                .font(.system(Tokens.TextStyle.body))
                .foregroundStyle(foreground)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier(id)
        }
        .padding(Tokens.Spacing.space3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            let shape = RoundedRectangle(cornerRadius: Tokens.Radius.md, style: .continuous)
            shape.fill(background)
            if kind == .accent {
                shape.fill(Tokens.Colors.accentFill.opacity(0.14))
            }
        }
    }

    private var foreground: Color {
        switch kind {
        case .error: Tokens.Colors.statusDangerText
        case .success: Tokens.Colors.statusSuccessText
        case .info: Tokens.Colors.statusNeutralFg
        case .accent: Tokens.Colors.textPrimary
        }
    }

    private var background: Color {
        switch kind {
        case .error: Tokens.Colors.statusDangerBg
        case .success: Tokens.Colors.statusSuccessBg
        case .info: Tokens.Colors.statusNeutralBg
        case .accent: Tokens.Colors.bgSurface
        }
    }
}

/// Grey rows in the shape of the list while it loads (`information-architecture.md §9.5`: skeleton rows, no
/// spinner-only screen). Read as one loading indicator by VoiceOver.
public struct SkeletonRows: View {
    let label: String
    let id: String

    public init(label: String, id: String) {
        self.label = label
        self.id = id
    }

    public var body: some View {
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

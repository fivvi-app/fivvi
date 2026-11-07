import SwiftUI
import FivviDesignTokens

/// The colour of a `NextCard`: the accent or one session type, each a gradient that stays in one hue and text that
/// meets the contrast minimum on both ends of it. Open Gym is not offered: no screen uses it yet (E020 AC6).
enum NextCardTone: CaseIterable {
    case accent, privateSession, group

    var gradient: [Color] {
        switch self {
        case .accent: [Tokens.Colors.accentGradientTop, Tokens.Colors.accentGradientBottom]
        case .privateSession: [Tokens.Colors.sessionPrivateGradientTop, Tokens.Colors.sessionPrivateGradientBottom]
        case .group: [Tokens.Colors.sessionGroupGradientTop, Tokens.Colors.sessionGroupGradientBottom]
        }
    }

    var text: Color {
        switch self {
        case .accent: Tokens.Colors.accentOn
        case .privateSession: Tokens.Colors.sessionPrivateOnSolid
        case .group: Tokens.Colors.sessionGroupOnSolid
        }
    }
}

/// The gradient "next" card (E020 AC14), such as *Volgende sessie*: a caption in capitals, a title, a line under it and
/// room for actions. Buttons in `actions` get the system's glass style, 48 pt high.
struct NextCard<Actions: View>: View {
    let tone: NextCardTone
    let caption: String
    let title: String
    var subtitle: String?
    @ViewBuilder let actions: Actions

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Spacing.space1) {
            Text(caption)
                .font(.system(Tokens.TextStyle.footnote, weight: .semibold))
                .textCase(.uppercase)
            Text(title)
                .font(.system(Tokens.TextStyle.title2, weight: .bold))
                .accessibilityAddTraits(.isHeader)
            if let subtitle {
                Text(subtitle)
                    .font(.system(Tokens.TextStyle.subhead))
            }
            HStack(spacing: PillButtonMetrics.stackedSpacing) {
                actions
            }
            .buttonStyle(.glass)
            .controlSize(.large)
            .padding(.top, Tokens.Spacing.space3)
        }
        .foregroundStyle(tone.text)
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(colors: tone.gradient, startPoint: .top, endPoint: .bottom),
            in: RoundedRectangle(cornerRadius: CardStyle.radius, style: .continuous)
        )
    }
}

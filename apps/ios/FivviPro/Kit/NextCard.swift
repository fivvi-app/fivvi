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

enum NextCardMetrics {
    /// The actions are 48 pt high (the prototype's `.hero .gl`); the icon action is 48 pt wide as well.
    static let actionHeight: CGFloat = 48
    /// The space above the actions.
    static let actionsTop: CGFloat = 16
    /// The title's size at the default text size (24 pt; no text style has it), scaled with Dynamic Type.
    static let titleSize: CGFloat = 24
}

private struct NextCardToneKey: EnvironmentKey {
    static let defaultValue = NextCardTone.accent
}

extension EnvironmentValues {
    fileprivate var nextCardTone: NextCardTone {
        get { self[NextCardToneKey.self] }
        set { self[NextCardToneKey.self] = newValue }
    }
}

private struct NextCardActionStyle: ButtonStyle {
    let isIcon: Bool
    @Environment(\.nextCardTone) private var tone

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(Tokens.TextStyle.body, weight: .semibold))
            .foregroundStyle(tone.text)
            .padding(.horizontal, isIcon ? 0 : Tokens.Spacing.space5)
            .frame(width: isIcon ? NextCardMetrics.actionHeight : nil, alignment: .center)
            .frame(minHeight: NextCardMetrics.actionHeight)
            .glassEffect(.regular.interactive(), in: .capsule)
            .opacity(configuration.isPressed ? 0.85 : 1)
    }
}

/// A text action of a `NextCard`: a glass pill 48 pt high, in the card's text colour.
struct NextCardButton: View {
    let title: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title).fixedSize(horizontal: false, vertical: true)
        }
        .buttonStyle(NextCardActionStyle(isIcon: false))
    }
}

/// An icon action of a `NextCard`: a glass circle 48 pt across. `label` is its accessible name.
struct NextCardIconButton: View {
    let systemImage: String
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
        }
        .buttonStyle(NextCardActionStyle(isIcon: true))
        .accessibilityLabel(label)
    }
}

/// The gradient "next" card (E020 AC14), such as *Volgende sessie*: a caption in capitals, a title, a line under it and,
/// 16 pt below, the actions: `NextCardButton` and `NextCardIconButton`, glass buttons 48 pt high.
struct NextCard<Actions: View>: View {
    let tone: NextCardTone
    let caption: String
    let title: String
    var subtitle: String?
    @ViewBuilder let actions: Actions
    @ScaledMetric(relativeTo: .title2) private var titleSize = NextCardMetrics.titleSize

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Spacing.space1) {
            Text(caption)
                .font(.system(Tokens.TextStyle.footnote, weight: .semibold))
                .textCase(.uppercase)
            Text(title)
                .font(.system(size: titleSize, weight: .bold))
                .accessibilityAddTraits(.isHeader)
            if let subtitle {
                Text(subtitle)
                    .font(.system(Tokens.TextStyle.subhead))
            }
            HStack(spacing: PillButtonMetrics.stackedSpacing) {
                actions
            }
            .padding(.top, NextCardMetrics.actionsTop - Tokens.Spacing.space1)
        }
        .environment(\.nextCardTone, tone)
        .foregroundStyle(tone.text)
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(colors: tone.gradient, startPoint: .top, endPoint: .bottom),
            in: RoundedRectangle(cornerRadius: CardStyle.radius, style: .continuous)
        )
    }
}

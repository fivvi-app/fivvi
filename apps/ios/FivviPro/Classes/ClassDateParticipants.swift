import SwiftUI
import FivviDesignTokens
import FivviUI

/// TD-03's *Deelnemers · 7* (F025, #1616) with *Toon alle 7* beside it, over the first few participants. At the
/// accessibility text sizes the button goes under the title, so neither is cut.
struct ClassDateParticipants: View {
    let model: ClassDateViewModel

    @Environment(\.dynamicTypeSize) private var textSize

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Spacing.space2) {
            let layout = textSize.isAccessibilitySize
                ? AnyLayout(VStackLayout(alignment: .leading, spacing: 0))
                : AnyLayout(HStackLayout(spacing: Tokens.Spacing.space2))
            layout {
                Text(model.participantsTitleText)
                    .font(.system(Tokens.TextStyle.footnote, weight: .semibold))
                    .textCase(.uppercase)
                    .foregroundStyle(Tokens.Colors.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityIdentifier("classDate.participantsTitle")
                if !textSize.isAccessibilitySize { Spacer(minLength: Tokens.Spacing.space2) }
                if model.showsAllParticipantsButton {
                    Button { model.showAllParticipants() } label: {
                        Text(model.showAllParticipantsText)
                            .font(.system(Tokens.TextStyle.body, weight: .semibold))
                            .foregroundStyle(Tokens.Colors.accentText)
                            .multilineTextAlignment(.leading)
                            .frame(minWidth: 44, minHeight: 44, alignment: .leading)
                            .contentShape(Rectangle())
                    }
                    .accessibilityIdentifier("classDate.participants.showAll")
                }
            }
            .padding(.horizontal, Tokens.Spacing.space5)
            InsetGroup(separatorInset: 68) {
                ForEach(model.shownParticipants) { participant in participantRow(participant) }
            }
        }
    }

    /// One participant: the avatar, the name and the status as a pill, one element for VoiceOver ("Anna de Vries,
    /// aanwezig"). At the accessibility text sizes the pill goes under the name.
    private func participantRow(_ participant: ClassDateViewModel.ParticipantRow) -> some View {
        let layout = textSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: Tokens.Spacing.space2))
            : AnyLayout(HStackLayout(spacing: Tokens.Spacing.space3))
        return layout {
            HStack(spacing: Tokens.Spacing.space3) {
                PersonAvatar(name: participant.name)
                Text(participant.name)
                    .font(.system(Tokens.TextStyle.body, weight: .semibold))
                    .foregroundStyle(Tokens.Colors.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: Tokens.Spacing.space2)
            }
            StatusPill(text: participant.statusText, kind: participant.status.pillKind)
        }
        .multilineTextAlignment(.leading)
        .insetRowLayout()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(participant.spokenLabel)
        .accessibilityIdentifier("classDate.participant.\(participant.clientID)")
    }
}

private extension AttendanceStatus {
    /// *Aanwezig* in green, *Niet verschenen* in red, *Geboekt* neutral (Android: Success, Danger, Neutral).
    var pillKind: StatusPillKind {
        switch self {
        case .attended: .success
        case .noShow: .danger
        case .booked, .cancelled: .neutral
        }
    }
}

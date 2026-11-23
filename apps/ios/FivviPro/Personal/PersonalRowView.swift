import SwiftUI
import FivviDesignTokens
import FivviStrings
import FivviUI

/// A row of Vandaag and Agenda, Calendar-style on iOS (`DECISIONS.md` §3): a time column and a bar in the session type's
/// colour, the name, what only fits when there is more than one kind or team, and for a class the pill. It is one element
/// for VoiceOver, named with the type; the arrow to the maps app is an action of it.
struct PersonalRowView: View {
    let row: PersonalRow
    let catalog: Catalog
    let onOpen: () -> Void
    /// The row's test ids are `<prefix>.row.<id>` and `<prefix>.route.<id>`: Vandaag's are `today`, Agenda's `calendar`.
    var identifierPrefix = "today"
    @Environment(\.openURL) private var openURL

    var body: some View {
        HStack(spacing: 0) {
            Button(action: onOpen) {
                HStack(alignment: .top, spacing: Tokens.Spacing.space3) {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(row.startText).font(.system(Tokens.TextStyle.body, weight: .semibold)).monospacedDigit()
                        Text(row.endText).font(.system(Tokens.TextStyle.footnote)).monospacedDigit()
                            .foregroundStyle(Tokens.Colors.textSecondary)
                    }
                    .frame(minWidth: 48, alignment: .trailing)
                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                        .fill(row.isGroup ? Tokens.Colors.sessionGroupSolid : Tokens.Colors.sessionPrivateSolid)
                        .frame(width: 4)
                    details
                    Spacer(minLength: Tokens.Spacing.space2)
                    if let pill = row.pill {
                        StatusPill(text: pill, kind: row.pillIsFull ? .warning : .neutral)
                    }
                }
                .insetRowLayout()
                .opacity(row.isPast || row.isCancelled ? 0.55 : 1)
            }
            .buttonStyle(.insetRow)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(row.spokenLabel)
            .accessibilityAddTraits(.isButton)
            .accessibilityActions {
                if let url = row.routeURL { Button(catalog[.todayOpenRoute]) { openURL(url) } }
            }
            .accessibilityIdentifier("\(identifierPrefix).row.\(row.id)")
            if let url = row.routeURL {
                Link(destination: url) {
                    Image(systemName: "arrow.up.right")
                        .font(.system(Tokens.TextStyle.body, weight: .semibold))
                        .frame(minWidth: 44, minHeight: 44)
                }
                .accessibilityHidden(true)
                .accessibilityIdentifier("\(identifierPrefix).route.\(row.id)")
            }
        }
    }

    private var details: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(row.title)
                .font(.system(Tokens.TextStyle.body, weight: .semibold))
                .strikethrough(row.isCancelled)
                .foregroundStyle(Tokens.Colors.textPrimary)
            if let typeLabel = row.typeLabel { secondary(typeLabel) }
            if let location = row.location { secondary(location) }
            if let workspace = row.workspaceLabel {
                HStack(spacing: Tokens.Spacing.space1) {
                    Circle().fill(Tokens.workspaceColor(for: row.workspaceID)).frame(width: 8, height: 8)
                    secondary(workspace)
                }
            }
            if row.isCancelled { secondary(catalog[.todayCancelled]) }
        }
        .multilineTextAlignment(.leading)
    }

    private func secondary(_ text: String) -> some View {
        Text(text).font(.system(Tokens.TextStyle.subhead)).foregroundStyle(Tokens.Colors.textSecondary)
    }
}

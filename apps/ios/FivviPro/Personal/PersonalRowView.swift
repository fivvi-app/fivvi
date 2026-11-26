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
    /// *Aanwezig* or *Niet verschenen* on the row's nudge (F025); nil where the list shows no nudges (Agenda).
    var onMark: ((AttendanceStatus) -> Void)?
    /// The line *Aanwezigheid nog invullen* of an ended class opens CO-05 (F025); where it is nil, it opens the row.
    var onOpenAttendance: (() -> Void)?
    /// The row's test ids are `<prefix>.row.<id>` and `<prefix>.route.<id>`: Vandaag's are `today`, Agenda's `calendar`.
    var identifierPrefix = "today"
    @Environment(\.openURL) private var openURL
    /// The bars scale with the text size (they are drawn for the body text).
    @ScaledMetric(relativeTo: .body) private var barsScale = 1

    var body: some View {
        let actions = swipeActions
        if actions.leading.isEmpty && actions.trailing.isEmpty {
            rowAndNudge
        } else {
            SwipeActionsRow(id: row.id, leading: actions.leading, trailing: actions.trailing) { rowAndNudge }
        }
    }

    private var rowAndNudge: some View {
        VStack(alignment: .leading, spacing: 0) {
            line
            if let nudge = row.nudge, let onMark { self.nudge(nudge, onMark) }
            if row.attendanceLine { attendanceLine }
        }
    }

    /// The swipes of a row with a nudge (F025, TD-01): rightward *Aanwezig* (the leading side), leftward *Niet verschenen*
    /// (the trailing side), as the buttons under it. A tap that waits for the connection has been made: nothing to swipe for.
    private var swipeActions: (leading: [SwipeAction], trailing: [SwipeAction]) {
        guard let nudge = row.nudge, !nudge.isWaiting, let onMark else { return ([], []) }
        func action(_ status: AttendanceStatus, _ name: String, _ solid: Color, _ onSolid: Color) -> SwipeAction {
            let word = statusWord(status)
            return SwipeAction(
                title: word, label: catalog.string(.attendanceNudgeButtonLabel, nudge.clientName, word), fill: solid,
                foreground: onSolid, identifier: "\(identifierPrefix).swipe.\(name).\(row.id)",
                perform: { onMark(status) }
            )
        }
        return (
            [action(.attended, "attended", Tokens.Colors.actionPrimaryBg, Tokens.Colors.actionPrimaryFg)],
            [action(.noShow, "noShow", Tokens.Colors.actionDangerBg, Tokens.Colors.actionDangerFg)]
        )
    }

    private func statusWord(_ status: AttendanceStatus) -> String {
        status == .attended ? catalog[.attendanceAttended] : catalog[.attendanceNoShow]
    }

    private var line: some View {
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
                if row.nudge?.isWaiting == false, let onMark {
                    Button(catalog[.attendanceAttended]) { onMark(.attended) }
                    Button(catalog[.attendanceNoShow]) { onMark(.noShow) }
                }
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

    /// *Aanwezigheid nog invullen* with *Aanwezig* and *Niet verschenen* under the row (F025). A tap that waits for the
    /// connection leaves *Wacht op verbinding* instead of the buttons; one the API refused leaves its message above them.
    private func nudge(_ nudge: PersonalRow.Nudge, _ onMark: @escaping (AttendanceStatus) -> Void) -> some View {
        VStack(alignment: .leading, spacing: Tokens.Spacing.space2) {
            if let waiting = nudge.waitingText, nudge.isWaiting {
                Label(waiting, systemImage: "clock")
                    .font(.system(Tokens.TextStyle.subhead, weight: .semibold))
                    .foregroundStyle(Tokens.Colors.textSecondary)
                    .accessibilityIdentifier("\(identifierPrefix).nudge.waiting.\(row.id)")
            } else {
                Label(catalog[.attendanceNudge], systemImage: "exclamationmark.triangle")
                    .font(.system(Tokens.TextStyle.subhead, weight: .semibold))
                    .foregroundStyle(Tokens.Colors.statusWarningText)
                    .accessibilityIdentifier("\(identifierPrefix).nudge.\(row.id)")
                if let message = nudge.message {
                    Text(message)
                        .font(.system(Tokens.TextStyle.footnote))
                        .foregroundStyle(Tokens.Colors.statusDangerText)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("\(identifierPrefix).nudge.message.\(row.id)")
                }
                HStack(spacing: Tokens.Spacing.space2) {
                    nudgeButton(.attended, "attended", onMark)
                    nudgeButton(.noShow, "noShow", onMark)
                }
            }
        }
        .padding(.horizontal, Tokens.Spacing.space4)
        .padding(.bottom, Tokens.Spacing.space3)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// *Aanwezigheid nog invullen* of an ended class (or duo): the line alone, as a link to the screen where each person is
    /// filled in (CO-05 for a class).
    private var attendanceLine: some View {
        Button { (onOpenAttendance ?? onOpen)() } label: {
            Label(catalog[.attendanceNudge], systemImage: "exclamationmark.triangle")
                .font(.system(Tokens.TextStyle.subhead, weight: .semibold))
                .foregroundStyle(Tokens.Colors.statusWarningText)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.horizontal, Tokens.Spacing.space4)
        .accessibilityIdentifier("\(identifierPrefix).nudge.\(row.id)")
    }

    private func nudgeButton(
        _ status: AttendanceStatus, _ name: String, _ onMark: @escaping (AttendanceStatus) -> Void
    ) -> some View {
        let word = statusWord(status)
        return Button { onMark(status) } label: {
            Text(word)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.pill(.tonal))
        .accessibilityLabel(// Placeholders in the order of their names: name, status.
        catalog.string(.attendanceNudgeButtonLabel, row.nudge?.clientName ?? "", word))
        .accessibilityIdentifier("\(identifierPrefix).nudge.\(name).\(row.id)")
    }

    private var details: some View {
        VStack(alignment: .leading, spacing: 2) {
            title
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

    /// The class name, and for a class with a level the compact bars right after it (F067): they are part of the text, so a
    /// long name wraps and the bars stay with its last word; nothing is cut off.
    private var title: Text {
        let name = Text(row.title)
            .font(.system(Tokens.TextStyle.body, weight: .semibold))
            .strikethrough(row.isCancelled)
            .foregroundStyle(Tokens.Colors.textPrimary)
        return LevelIcon.row(name: name, level: row.level, scale: barsScale)
    }

    private func secondary(_ text: String) -> some View {
        Text(text).font(.system(Tokens.TextStyle.subhead)).foregroundStyle(Tokens.Colors.textSecondary)
    }
}

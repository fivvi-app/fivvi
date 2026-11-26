import SwiftUI
import FivviDesignTokens
import FivviStrings
import FivviUI

/// TD-02's *Aanwezigheid* section (F025, `DECISIONS.md` §3, "Attendance as a segmented control"): *Geboekt | Aanwezig |
/// Niet verschenen* for the client (one control per client of a duo), saving at once through the offline queue.
/// Before the window opens the control is off with "Vanaf 08:30."; on a cancelled session with "Geannuleerd.". A row that
/// waits for the connection says "Wacht op verbinding"; a request the API refused reverts the row with its message.
struct AttendanceSection: View {
    let model: AttendanceModel
    private var catalog: Catalog { model.catalog }

    var body: some View {
        Group {
            if model.state == .loaded, !model.rows.isEmpty { content }
        }
        .onChange(of: model.refusals) { Task { await model.refresh() } }
        .sensoryFeedback(SensoryFeedback.selection, trigger: model.rows.map(\.status))
    }

    private var content: some View {
        let rows = model.rows
        return VStack(alignment: .leading, spacing: Tokens.Spacing.space2) {
            InsetGroup(header: catalog[.attendanceTitle], headerIdentifier: "session.attendance.title") {
                ForEach(rows) { row in control(row, named: rows.count > 1) }
            }
            if let note = model.cancelledNote ?? model.fromText {
                Text(note)
                    .font(.system(Tokens.TextStyle.footnote))
                    .foregroundStyle(Tokens.Colors.textSecondary)
                    .padding(.horizontal, Tokens.Spacing.space5)
                    .accessibilityIdentifier("session.attendance.note")
            }
        }
    }

    private func control(_ row: AttendanceModel.Row, named: Bool) -> some View {
        VStack(alignment: .leading, spacing: Tokens.Spacing.space2) {
            if named {
                Text(row.name)
                    .font(.system(Tokens.TextStyle.body, weight: .semibold))
                    .foregroundStyle(Tokens.Colors.textPrimary)
            }
            Picker(
                catalog.string(.attendanceGroupLabel, row.name),
                selection: Binding(get: { row.status }, set: { model.set($0, for: row.clientID) })
            ) {
                Text(catalog[.attendanceBooked]).tag(AttendanceStatus.booked)
                Text(catalog[.attendanceAttended]).tag(AttendanceStatus.attended)
                Text(catalog[.attendanceNoShow]).tag(AttendanceStatus.noShow)
            }
            .pickerStyle(.segmented)
            .disabled(!model.canMark)
            .accessibilityLabel(catalog.string(.attendanceGroupLabel, row.name))
            .accessibilityIdentifier("session.attendance.\(row.clientID)")
            if let line = line(row) {
                Text(line)
                    .font(.system(Tokens.TextStyle.footnote))
                    .foregroundStyle(Tokens.Colors.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("session.attendance.line.\(row.clientID)")
            }
        }
        .insetRowLayout()
    }

    /// "Wacht op verbinding" while the row's request waits, or what the API said about the one it refused.
    private func line(_ row: AttendanceModel.Row) -> String? {
        if let message = row.message { return message }
        return row.isPending && model.rowsWaitForConnection ? model.waitingText : nil
    }
}

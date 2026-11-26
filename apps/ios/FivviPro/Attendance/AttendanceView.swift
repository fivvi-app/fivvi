import SwiftUI
import FivviAPI
import FivviDesignTokens
import FivviStrings
import FivviLanguage
import FivviUI

/// CO-05 *Aanwezigheid* of a class date (F025, the prototype's *Aanwezigheid les*): the summary as three tiles, *Iedereen
/// aanwezig* as a full-width secondary button, then the participants with a check and a cross each. A tap saves at once
/// (no *Opslaan*) through the offline queue: the row says "Wacht op verbinding" until it is sent, and the summary counts
/// what the phone has. Before the window the buttons are off with the time; a cancelled class has none.
struct AttendanceView: View {
    let model: AttendanceModel
    let language: AppLanguage
    /// "Kracht · 18:00–19:00", from the class date's screen that opened this one.
    let subtitle: String

    @Environment(\.dynamicTypeSize) private var textSize
    /// What the summary said when it was last announced (F025: announced politely when it changes).
    @State private var announcer = SummaryAnnouncer()

    private var catalog: Catalog { model.catalog }

    var body: some View {
        Group {
            switch model.state {
            case .loading:
                placeholder { SkeletonRows(label: catalog[.commonLoading], id: "attendance.loading") }
            case .failed:
                placeholder { failure }
            case .noPermission:
                placeholder {
                    StatusMessage(text: catalog[.noPermissionTitle], kind: .info, id: "attendance.noPermissionTitle")
                    StatusMessage(
                        text: catalog.string(.noPermissionBody, model.workspace.name), kind: .info,
                        id: "attendance.noPermission"
                    )
                }
            case .loaded:
                loaded
            }
        }
        .task { await model.load() }
        .onReturnToForeground { await model.refresh() }
        .onChange(of: model.refusals) { Task { await model.refresh() } }
        .onChange(of: language.catalog) { _, catalog in model.use(catalog) }
        .onChange(of: model.summaryText, initial: true) { announceSummary() }
        .onChange(of: model.state) { announceSummary() }
        .sensoryFeedback(SensoryFeedback.selection, trigger: model.rows.map(\.status))
        .environment(\.locale, catalog.formattingLocale)
    }

    /// The summary, as a polite announcement (it does not interrupt what VoiceOver is saying).
    private func announceSummary() {
        let isLoaded = model.state == .loaded
        guard let text = announcer.announcement(for: model.summaryText, isLoaded: isLoaded) else { return }
        var announcement = AttributedString(text)
        announcement.accessibilitySpeechAnnouncementPriority = .low
        AccessibilityNotification.Announcement(announcement).post()
    }

    private func placeholder(@ViewBuilder _ content: () -> some View) -> some View {
        LargeTitleScreen(title: catalog[.attendanceTitle], subtitle: subtitle, titleIdentifier: "attendance.title") {
            content()
        }
    }

    private var failure: some View {
        VStack(alignment: .leading, spacing: Tokens.Spacing.space4) {
            StatusMessage(text: catalog[.sessionFormLoadFailed], kind: .error, id: "attendance.error")
            PillButtonStack {
                Button { Task { await model.load() } } label: {
                    Text(catalog[.commonRetry]).frame(maxWidth: .infinity)
                }
                .buttonStyle(.pill(.filled))
                .accessibilityIdentifier("attendance.retry")
            }
        }
    }

    private var loaded: some View {
        LargeTitleScreen(title: catalog[.attendanceTitle], subtitle: subtitle, titleIdentifier: "attendance.title") {
            if let cancelled = model.cancelledText {
                StatusMessage(text: cancelled, kind: .info, id: "attendance.cancelled")
            } else if let early = model.tooEarlyText {
                StatusMessage(text: early, kind: .info, id: "attendance.tooEarly")
            }
            summary
            if !model.isCancelled { everyone }
            participants
        }
    }

    // MARK: Pieces

    /// *Aanwezig 5 · Niet verschenen 1 · Open 1* as tiles; one element for VoiceOver, read as the summary line.
    private var summary: some View {
        let counts = model.summary
        return HStack(spacing: Tokens.Spacing.space2) {
            tile(catalog[.attendanceAttended], counts.attended, Tokens.Colors.statusSuccessText)
            tile(catalog[.attendanceNoShow], counts.noShow, Tokens.Colors.statusDangerText)
            tile(catalog[.attendanceOpenLabel], counts.open, Tokens.Colors.textSecondary)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(model.summaryText)
        .accessibilityIdentifier("attendance.summary")
    }

    private func tile(_ label: String, _ count: Int, _ colour: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.system(Tokens.TextStyle.footnote, weight: .semibold))
                .foregroundStyle(colour)
                .fixedSize(horizontal: false, vertical: true)
            Text(String(count))
                .font(.system(Tokens.TextStyle.title1, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(Tokens.Colors.textPrimary)
        }
        .padding(Tokens.Spacing.space3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            Tokens.Colors.bgSurface, in: RoundedRectangle(cornerRadius: Tokens.Radius.md, style: .continuous)
        )
    }

    private var everyone: some View {
        PillButtonStack {
            Button { model.markEveryone() } label: {
                Text(catalog[.attendanceEveryone])
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.pill(.tonal))
            .disabled(!model.canMarkEveryone)
            .accessibilityIdentifier("attendance.everyone")
        }
    }

    @ViewBuilder private var participants: some View {
        let rows = model.rows
        if !rows.isEmpty {
            InsetGroup(
                header: catalog[.attendanceParticipants], headerIdentifier: "attendance.participantsTitle",
                separatorInset: 68
            ) {
                ForEach(rows) { row in participant(row) }
            }
        }
    }

    /// One row: the person, with the two buttons at the trailing side, or under the name at the accessibility text sizes
    /// (flow 06). For VoiceOver it is one element, "Anna de Vries, aanwezig", with *Aanwezig* and *Niet verschenen* as its
    /// custom actions; the buttons are for the eye and the finger.
    private func participant(_ row: AttendanceModel.Row) -> some View {
        let showsButtons = row.status != .cancelled && !model.isCancelled
        let layout = textSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: Tokens.Spacing.space2))
            : AnyLayout(HStackLayout(spacing: Tokens.Spacing.space3))
        return layout {
            HStack(spacing: Tokens.Spacing.space3) {
                PersonAvatar(name: row.name)
                VStack(alignment: .leading, spacing: 2) {
                    Text(row.name)
                        .font(.system(Tokens.TextStyle.body, weight: .semibold))
                        .foregroundStyle(Tokens.Colors.textPrimary)
                    if let line = line(row) {
                        Text(line)
                            .font(.system(Tokens.TextStyle.footnote))
                            .foregroundStyle(
                                row.message == nil ? Tokens.Colors.textSecondary : Tokens.Colors.statusDangerText
                            )
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                Spacer(minLength: Tokens.Spacing.space2)
            }
            if showsButtons {
                HStack(spacing: Tokens.Spacing.space2) {
                    mark(row, .attended, symbol: "checkmark", selected: Tokens.Colors.statusSuccessBg)
                    mark(row, .noShow, symbol: "xmark", selected: Tokens.Colors.statusDangerBg)
                }
            }
        }
        .multilineTextAlignment(.leading)
        .insetRowLayout()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(model.spokenLabel(row))
        .accessibilityActions {
            if showsButtons && model.canMark {
                Button(model.statusText(.attended)) { model.toggle(.attended, for: row.clientID) }
                Button(model.statusText(.noShow)) { model.toggle(.noShow, for: row.clientID) }
            }
        }
        .accessibilityIdentifier("attendance.row.\(row.clientID)")
    }

    /// "Geannuleerd" for a participant who cancelled, "Wacht op verbinding" while a tap waits, or the API's message.
    private func line(_ row: AttendanceModel.Row) -> String? {
        if let message = row.message { return message }
        if row.status == .cancelled { return catalog[.attendanceCancelledStatus] }
        return row.isPending && model.rowsWaitForConnection ? model.waitingText : nil
    }

    private func mark(
        _ row: AttendanceModel.Row, _ status: AttendanceStatus, symbol: String, selected: Color
    ) -> some View {
        let isOn = row.status == status
        return Button { model.toggle(status, for: row.clientID) } label: {
            Image(systemName: symbol)
                .font(.system(Tokens.TextStyle.body, weight: .semibold))
                .foregroundStyle(isOn ? Tokens.Colors.textPrimary : Tokens.Colors.textSecondary)
                .frame(width: 44, height: 44)
                .background(isOn ? selected : Tokens.Colors.bgSubtle, in: Circle())
        }
        .buttonStyle(.plain)
        .disabled(!model.canMark)
    }
}

/// Owns the model of CO-05 for as long as the screen is pushed.
struct AttendanceScreen: View {
    @State private var model: AttendanceModel
    let language: AppLanguage
    let subtitle: String

    init(
        api: any APIProtocol, workspace: CurrentWorkspace, route: AttendanceRoute, language: AppLanguage,
        capabilities: WorkspaceCapabilities, queue: AttendanceQueue
    ) {
        _model = State(initialValue: AttendanceModel(
            api: api, workspace: workspace, sessionID: route.sessionID, catalog: language.catalog, queue: queue,
            now: UITestClock.provider(),
            onForbidden: { await capabilities.forbidden(.attendance_mark_any, in: workspace.id) }
        ))
        self.language = language
        subtitle = route.subtitle
    }

    var body: some View {
        AttendanceView(model: model, language: language, subtitle: subtitle)
    }
}

/// CO-05 of one class date: the name and the time come from TD-03, which opens it.
struct AttendanceRoute: Hashable {
    let workspaceID: String
    let sessionID: String
    /// "Kracht · 18:00–19:00"
    let subtitle: String
}

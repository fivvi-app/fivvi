import SwiftUI
import FivviDesignTokens
import FivviStrings
import FivviUI

/// TD-04 *Agenda* (F013, `DECISIONS.md` §3): the large title, *Dag | Week | Maand* under it and *Vandaag* in the bar. *Dag*
/// and *Week* share the strip of the week, a dot under each day for each session in its type's colour, with ‹ › and a swipe
/// for the other weeks; *Dag* is the selected day as a timeline, *Week* the seven days as lists. *Maand* is the month grid
/// with the selected day's list under it. The days on screen are read in one request, by pull and on the foreground too,
/// and a week the clocks change in says so.
struct AgendaView: View {
    let model: AgendaModel
    let onOpen: (PersonalRow) -> Void

    private var catalog: Catalog { model.catalog }

    var body: some View {
        LargeTitleScreen(title: catalog[.calendarTitle], titleIdentifier: "calendar.title") {
            banners
            modeControl
            switch model.mode {
            case .day, .week: weekHeader
            case .month: MonthGridView(model: model)
            }
            ForEach(model.clockNotes, id: \.self) { note in
                StatusMessage(text: note, kind: .info, id: "calendar.clockNote")
            }
            if model.state == .loading {
                SkeletonRows(label: catalog[.commonLoading], id: "calendar.loading")
            } else if model.state == .failed {
                retry
            } else {
                loaded
            }
        }
        .task(id: model.rangeKey) { await model.load() }
        .refreshable { await model.load() }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.significantTimeChangeNotification)) { _ in
            Task { await model.load() }
        }
    }

    // MARK: States

    @ViewBuilder private var banners: some View {
        if let offline = model.offlineText { StatusMessage(text: offline, kind: .info, id: "calendar.offline") }
        if model.updateFailed { retry }
        if let hint = model.timeZoneHint { StatusMessage(text: hint, kind: .info, id: "calendar.timeZoneHint") }
    }

    private var retry: some View {
        VStack(alignment: .leading, spacing: Tokens.Spacing.space3) {
            if let text = model.failedText { StatusMessage(text: text, kind: .error, id: "calendar.failed") }
            PillButtonStack {
                Button { Task { await model.load() } } label: {
                    Text(catalog[.todayRetry]).frame(maxWidth: .infinity)
                }
                .buttonStyle(.pill(.tonal))
                .accessibilityIdentifier("calendar.retry")
            }
        }
    }

    private var modeControl: some View {
        Picker(
            catalog[.calendarViews],
            selection: Binding(get: { model.mode }, set: { model.show($0) })
        ) {
            Text(catalog[.calendarViewDay]).tag(AgendaModel.Mode.day)
            Text(catalog[.calendarViewWeek]).tag(AgendaModel.Mode.week)
            Text(catalog[.calendarViewMonth]).tag(AgendaModel.Mode.month)
        }
        .pickerStyle(.segmented)
        .accessibilityLabel(catalog[.calendarViews])
        .accessibilityIdentifier("calendar.mode")
    }

    // MARK: The week

    /// The strip of the week, the line under it and what the clocks do in it.
    private var weekHeader: some View {
        VStack(spacing: Tokens.Spacing.space1) {
            WeekStripView(model: model)
            Text(model.weekLine)
                .font(.system(Tokens.TextStyle.footnote, weight: .semibold))
                .foregroundStyle(Tokens.Colors.textSecondary)
                .padding(.vertical, Tokens.Spacing.space2)
                .accessibilityIdentifier("calendar.weekLine")
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder private var loaded: some View {
        switch model.mode {
        case .day: dayTimeline
        case .week: weekList
        case .month: monthList
        }
    }

    /// *Dag*: the selected day as a timeline, the now-line moving with the clock.
    @ViewBuilder private var dayTimeline: some View {
        TimelineView(.periodic(from: .now, by: 30)) { _ in
            if let timeline = model.timeline(at: model.clockNow) {
                DayTimelineView(timeline: timeline, catalog: catalog, now: model.clockNow, onOpen: onOpen)
            } else if let empty = model.emptyText {
                emptyText(empty)
            }
        }
    }

    /// *Week*: each day of the week under its date, with TD-01's rows.
    private var weekList: some View {
        ForEach(model.weekSections) { section in
            InsetGroup(header: section.heading, headerIdentifier: "calendar.heading.\(section.day)") {
                if section.rows.isEmpty, let empty = section.emptyText {
                    Text(empty)
                        .font(.system(Tokens.TextStyle.body))
                        .foregroundStyle(Tokens.Colors.textSecondary)
                        .insetRowLayout()
                        .accessibilityIdentifier("calendar.empty.\(section.day)")
                } else {
                    ForEach(section.rows) { row in rowView(row) }
                }
            }
        }
    }

    /// *Maand*: the selected day's list under the grid.
    @ViewBuilder private var monthList: some View {
        let rows = model.selectedRows
        if rows.isEmpty {
            if let empty = model.emptyText { emptyText(empty) }
        } else {
            InsetGroup { ForEach(rows) { row in rowView(row) } }
        }
    }

    private func rowView(_ row: PersonalRow) -> some View {
        PersonalRowView(row: row, catalog: catalog, onOpen: { onOpen(row) }, identifierPrefix: "calendar")
    }

    private func emptyText(_ text: String) -> some View {
        Text(text)
            .font(.system(Tokens.TextStyle.body))
            .foregroundStyle(Tokens.Colors.textSecondary)
            .padding(.horizontal, Tokens.Spacing.space5)
            .accessibilityIdentifier("calendar.empty")
    }
}

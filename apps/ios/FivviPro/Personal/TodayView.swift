import SwiftUI
import FivviDesignTokens
import FivviStrings
import FivviUI

/// TD-01 *Vandaag* (F013): the large title with the date above it and the summary under it, no rings; the *Mijn dag* card;
/// the next item as the gradient card; every other item in time order; the *Morgen* line. Loading is skeleton rows,
/// the day refreshes by pull, on the foreground and on the OS's time-change signals (midnight rolls it over). An Owner
/// who trains in a workspace with a team has *Mijn dag | Hele studio* under the title (F014): the same screen with the
/// workspace's day, a lane per trainer, in place of the personal one.
struct TodayView: View {
    let model: TodayViewModel
    /// The Owner's *Mijn dag | Hele studio* (F014): the control, and the workspace's day.
    let studio: StudioDayModel
    /// *Plannen* may open PS-04: the person may plan sessions here, and the phone is online.
    let canPlan: Bool
    let onPlan: (Date) -> Void
    let onOpen: (PersonalRow) -> Void
    /// The line *Aanwezigheid nog invullen* of an ended class opens CO-05 (F025).
    let onOpenAttendance: (PersonalRow) -> Void
    let onOpenTomorrow: (String) -> Void

    /// The one row whose swipe actions are open: another opening, or a scroll, closes it.
    @State private var swipes = SwipeCoordinator()

    private var catalog: Catalog { model.catalog }

    var body: some View {
        LargeTitleScreen(
            title: catalog[.todayTitle], eyebrow: model.eyebrow,
            subtitle: studio.showsToggle ? nil : model.summaryText, titleIdentifier: "today.title"
        ) {
            banners
            if studio.showsToggle { scopeControl }
            if studio.isStudio {
                StudioDayView(model: studio, onOpen: onOpen, onOpenAttendance: onOpenAttendance)
            } else {
                switch model.state {
                case .loading:
                    SkeletonRows(label: catalog[.commonLoading], id: "today.loading")
                case .failed:
                    retry
                case .loaded:
                    loaded
                }
            }
        }
        .environment(swipes)
        .onScrollPhaseChange { _, phase in if phase == .interacting { swipes.closeAll() } }
        .refreshable {
            await model.refresh()
            await studio.refresh()
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.significantTimeChangeNotification)) { _ in
            Task {
                await model.load()
                if studio.isStudio { await studio.load() }
            }
        }
    }

    // MARK: States

    @ViewBuilder private var banners: some View {
        ForEach(model.notices, id: \.self) { notice in
            HStack(alignment: .top) {
                StatusMessage(text: notice, kind: .info, id: "today.notice")
                Button(catalog[.todayDismiss]) { model.dismissNotices() }
                    .accessibilityIdentifier("today.notice.dismiss")
            }
        }
        // The personal day's own states belong to Mijn dag: the studio shows its own.
        if !studio.isStudio {
            if let offline = model.offlineText { StatusMessage(text: offline, kind: .info, id: "today.offline") }
            if model.updateFailed { retry }
        }
        if let hint = model.timeZoneHint { StatusMessage(text: hint, kind: .info, id: "today.timeZoneHint") }
    }

    /// *Mijn dag | Hele studio* and the line under it: the summary of Mijn dag, or what the studio is.
    private var scopeControl: some View {
        VStack(alignment: .leading, spacing: Tokens.Spacing.space3) {
            Picker(
                catalog[.todayScopeLabel],
                selection: Binding(
                    get: { studio.scope }, set: { scope in Task { await studio.select(scope) } }
                )
            ) {
                Text(studio.scopeMineText).tag(StudioDayModel.Scope.mine)
                Text(studio.scopeStudioText).tag(StudioDayModel.Scope.studio)
            }
            .pickerStyle(.segmented)
            .accessibilityLabel(catalog[.todayScopeLabel])
            .accessibilityIdentifier("today.scope")
            if let line = studio.isStudio ? studio.line : model.summaryText {
                Text(line)
                    .font(.system(Tokens.TextStyle.subhead))
                    .foregroundStyle(Tokens.Colors.textSecondary)
                    .padding(.horizontal, Tokens.Spacing.space1)
                    .accessibilityIdentifier("today.scope.line")
            }
        }
    }

    private var retry: some View {
        VStack(alignment: .leading, spacing: Tokens.Spacing.space3) {
            if let text = model.failedText {
                StatusMessage(text: text, kind: .error, id: "today.failed")
            }
            PillButtonStack {
                Button { Task { await model.refresh() } } label: {
                    Text(catalog[.todayRetry]).frame(maxWidth: .infinity)
                }
                .buttonStyle(.pill(.tonal))
                .accessibilityIdentifier("today.retry")
            }
        }
    }

    @ViewBuilder private var loaded: some View {
        if let card = model.card { mijnDag(card) }
        if let next = model.next { nextCard(next.row, tone: next.row.isGroup ? .group : .privateSession) }
        if !model.rows.isEmpty {
            InsetGroup {
                ForEach(model.rows) { row in
                    PersonalRowView(
                        row: row, catalog: catalog, onOpen: { onOpen(row) }, onMark: { model.mark($0, row: row) },
                        onOpenAttendance: { onOpenAttendance(row) }
                    )
                }
            }
        }
        if let empty = model.emptyText {
            Text(empty)
                .font(.system(Tokens.TextStyle.body))
                .foregroundStyle(Tokens.Colors.textSecondary)
                .padding(.horizontal, Tokens.Spacing.space5)
                .accessibilityIdentifier("today.empty")
        }
        if let tomorrow = model.tomorrowText, let date = model.tomorrowDate {
            InsetGroup {
                Button { onOpenTomorrow(date) } label: { InsetRow(title: tomorrow, showsChevron: true) }
                    .buttonStyle(.insetRow)
                    .accessibilityHint(catalog[.todayTomorrowHint])
                    .accessibilityIdentifier("today.tomorrow")
            }
        }
    }

    // MARK: Pieces

    /// The card under the header: only what the list doesn't tell (`DECISIONS.md` §3).
    private func mijnDag(_ card: TodayViewModel.Card) -> some View {
        InsetGroup(header: catalog[.todayCardTitle]) {
            todo(card.todo)
            if let gap = card.gap {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(gap.text).font(.system(Tokens.TextStyle.body, weight: .semibold))
                            .accessibilityIdentifier("today.card.gap")
                        Text(gap.length).font(.system(Tokens.TextStyle.subhead))
                            .foregroundStyle(Tokens.Colors.textSecondary)
                    }
                    Spacer()
                    Button { onPlan(gap.start) } label: { Text(catalog[.todayPlan]) }
                        .buttonStyle(.pill(.tonal))
                        .disabled(!canPlan || model.isOffline)
                        .accessibilityHint(model.isOffline ? catalog[.commonOffline] : "")
                        .accessibilityIdentifier("today.card.plan")
                }
                .insetRowLayout()
            }
            if let none = card.noFreeTime {
                Text(none).font(.system(Tokens.TextStyle.body))
                    .insetRowLayout()
                    .accessibilityIdentifier("today.card.noFreeTime")
            }
            if let route = card.route {
                VStack(alignment: .leading, spacing: 2) {
                    Text(catalog[.todayRoute]).font(.system(Tokens.TextStyle.body, weight: .semibold))
                    Text(route).font(.system(Tokens.TextStyle.subhead)).foregroundStyle(Tokens.Colors.textSecondary)
                }
                .insetRowLayout()
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("today.card.route")
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("today.card")
    }

    /// The card's first row (F025): *Te doen* with a chip for each ended item whose attendance is open, or *Alles bijgewerkt*.
    private func todo(_ todo: TodayViewModel.Todo) -> some View {
        HStack(alignment: .top, spacing: Tokens.Spacing.space3) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(Tokens.TextStyle.title2))
                .foregroundStyle(Tokens.Colors.accentFill)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: Tokens.Spacing.space2) {
                Text(todo.title)
                    .font(.system(Tokens.TextStyle.body, weight: .semibold))
                    .accessibilityIdentifier("today.card.todo")
                if !todo.chips.isEmpty {
                    ChipFlow(spacing: Tokens.Spacing.space2) {
                        ForEach(todo.chips) { chip in
                            Button { onOpen(chip.row) } label: {
                                Text(chip.text)
                                    .font(.system(Tokens.TextStyle.subhead, weight: .semibold))
                                    .foregroundStyle(Tokens.Colors.textLink)
                                    .multilineTextAlignment(.leading)
                                    .padding(.horizontal, Tokens.Spacing.space3)
                                    .padding(.vertical, Tokens.Spacing.space2)
                                    .frame(minHeight: 44)
                                    .background(Tokens.Colors.actionTonalBg, in: Capsule(style: .continuous))
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("today.card.todo.\(chip.id)")
                        }
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .insetRowLayout()
    }

    private func nextCard(_ row: PersonalRow, tone: NextCardTone) -> some View {
        TimelineView(.periodic(from: .now, by: 30)) { _ in
            NextCard(
                tone: tone, caption: model.nextCaption(at: model.clockNow), title: row.title,
                subtitle: model.nextSubtitle, detail: model.nextDetail,
                spokenLabel: model.nextSpokenLabel(at: model.clockNow)
            ) {
                NextCardButton(title: catalog[.todayOpen]) { onOpen(row) }
                    .accessibilityIdentifier("today.next.open")
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("today.next")
    }
}

import SwiftUI
import FivviDesignTokens
import FivviStrings
import FivviUI

/// TD-01 *Vandaag* (F013): the large title with the date above it and the summary under it, no rings; the *Mijn dag* card;
/// the next item as the gradient card; every other item in time order; the *Morgen* line. Loading is skeleton rows,
/// the day refreshes by pull, on the foreground and on the OS's time-change signals (midnight rolls it over).
struct TodayView: View {
    let model: TodayViewModel
    /// *Plannen* may open PS-04: the person may plan sessions here, and the phone is online.
    let canPlan: Bool
    let onPlan: (Date) -> Void
    let onOpen: (PersonalRow) -> Void
    let onOpenTomorrow: (String) -> Void

    private var catalog: Catalog { model.catalog }

    var body: some View {
        LargeTitleScreen(
            title: catalog[.todayTitle], eyebrow: model.eyebrow, subtitle: model.summaryText,
            titleIdentifier: "today.title"
        ) {
            banners
            switch model.state {
            case .loading:
                SkeletonRows(label: catalog[.commonLoading], id: "today.loading")
            case .failed:
                retry
            case .loaded:
                loaded
            }
        }
        .refreshable { await model.load() }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.significantTimeChangeNotification)) { _ in
            Task { await model.load() }
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
        if let offline = model.offlineText { StatusMessage(text: offline, kind: .info, id: "today.offline") }
        if model.updateFailed { retry }
        if let hint = model.timeZoneHint { StatusMessage(text: hint, kind: .info, id: "today.timeZoneHint") }
    }

    private var retry: some View {
        VStack(alignment: .leading, spacing: Tokens.Spacing.space3) {
            if let text = model.failedText {
                StatusMessage(text: text, kind: .error, id: "today.failed")
            }
            PillButtonStack {
                Button { Task { await model.load() } } label: { Text(catalog[.todayRetry]).frame(maxWidth: .infinity) }
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
                    PersonalRowView(row: row, catalog: catalog, onOpen: { onOpen(row) })
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

    private func nextCard(_ row: PersonalRow, tone: NextCardTone) -> some View {
        TimelineView(.periodic(from: .now, by: 30)) { _ in
            NextCard(
                tone: tone, caption: model.nextCaption(at: model.clockNow), title: row.title,
                subtitle: model.nextSubtitle
            ) {
                NextCardButton(title: catalog[.todayOpen]) { onOpen(row) }
                    .accessibilityIdentifier("today.next.open")
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("today.next")
    }
}

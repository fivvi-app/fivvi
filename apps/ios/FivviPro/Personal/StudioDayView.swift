import SwiftUI
import FivviDesignTokens
import FivviStrings
import FivviUI

/// *Hele studio* on Vandaag (F014, `DECISIONS.md` §3): the team card with a lane per trainer, then the next card with its
/// trainer and the day's rows with theirs. Read-only: a block or a row opens TD-02 or TD-03 of the session, and nothing
/// here changes anything. It follows the clock, so the now-line and the dimmed blocks keep up.
struct StudioDayView: View {
    let model: StudioDayModel
    let onOpen: (PersonalRow) -> Void

    private var catalog: Catalog { model.catalog }

    var body: some View {
        switch model.state {
        case .loading:
            SkeletonRows(label: catalog[.commonLoading], id: "today.studio.loading")
        case .failed:
            retry
        case .loaded:
            TimelineView(.periodic(from: .now, by: 30)) { _ in
                loaded(at: model.clockNow)
            }
        }
    }

    private var retry: some View {
        VStack(alignment: .leading, spacing: Tokens.Spacing.space3) {
            if let text = model.offlineText ?? model.failedText {
                StatusMessage(text: text, kind: model.isOffline ? .info : .error, id: "today.studio.failed")
            }
            PillButtonStack {
                Button { Task { await model.refresh() } } label: {
                    Text(catalog[.todayRetry]).frame(maxWidth: .infinity)
                }
                .buttonStyle(.pill(.tonal))
                .accessibilityIdentifier("today.studio.retry")
            }
        }
    }

    @ViewBuilder private func loaded(at now: Date) -> some View {
        VStack(alignment: .leading, spacing: Tokens.Spacing.space6) {
            if model.updateFailed || model.isOffline { retry }
            if let card = model.team(at: now) { StudioTeamCard(card: card, onOpen: onOpen) }
            if let next = model.next(at: now) {
                NextCard(
                    tone: next.row.isGroup ? .group : .privateSession, caption: model.nextCaption(at: now),
                    title: next.row.title, subtitle: model.nextSubtitle(at: now)
                ) {
                    NextCardButton(title: catalog[.todayOpen]) { onOpen(next.row) }
                        .accessibilityIdentifier("today.studio.next.open")
                }
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("today.studio.next")
            }
            let rows = model.rows(at: now)
            if !rows.isEmpty {
                InsetGroup {
                    ForEach(rows) { row in
                        PersonalRowView(row: row, catalog: catalog, onOpen: { onOpen(row) })
                    }
                }
            }
        }
    }
}

/// The card of the prototype's *Hele studio*: its head, the lanes and the axis under them.
struct StudioTeamCard: View {
    let card: StudioDayModel.TeamCard
    let onOpen: (PersonalRow) -> Void
    private let labelWidth: CGFloat = 76

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: Tokens.Spacing.space3) {
                head
                if let timeline = card.timeline {
                    VStack(alignment: .leading, spacing: Tokens.Spacing.space2) {
                        lanes(timeline)
                        axis(timeline)
                    }
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("today.studio.card")
    }

    private var head: some View {
        HStack(alignment: .firstTextBaseline, spacing: Tokens.Spacing.space2) {
            Text(card.head)
                .font(.system(Tokens.TextStyle.headline, weight: .bold))
                .accessibilityIdentifier("today.studio.head")
            Spacer(minLength: Tokens.Spacing.space2)
            if let busiest = card.busiest {
                Text(busiest)
                    .font(.system(Tokens.TextStyle.subhead))
                    .foregroundStyle(Tokens.Colors.textSecondary)
                    .multilineTextAlignment(.trailing)
                    .accessibilityIdentifier("today.studio.busiest")
            }
        }
    }

    private func lanes(_ timeline: StudioTimeline) -> some View {
        VStack(alignment: .leading, spacing: Tokens.Spacing.space2) {
            ForEach(timeline.lanes) { lane in
                HStack(spacing: Tokens.Spacing.space2) {
                    label(lane).frame(width: labelWidth, alignment: .leading)
                    track(lane)
                }
            }
        }
        .overlay(alignment: .topLeading) { nowLine(timeline) }
    }

    private func label(_ lane: StudioTimeline.Lane) -> some View {
        HStack(spacing: Tokens.Spacing.space1) {
            if let name = lane.avatarName {
                PersonAvatar(name: name, size: 24)
            } else {
                Image(systemName: "person.crop.circle.badge.questionmark")
                    .foregroundStyle(Tokens.Colors.textSecondary)
                    .accessibilityHidden(true)
            }
            Text(lane.title)
                .font(.system(Tokens.TextStyle.footnote, weight: .semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .accessibilityIdentifier("today.studio.lane.\(lane.id)")
        }
    }

    private func track(_ lane: StudioTimeline.Lane) -> some View {
        let blockHeight: CGFloat = lane.rowCount > 1 ? 14 : 24
        return GeometryReader { proxy in
            ZStack(alignment: .topLeading) {
                ForEach(lane.blocks) { block in
                    Button { onOpen(block.row) } label: {
                        RoundedRectangle(cornerRadius: 4, style: .continuous)
                            .fill(block.isGroup ? Tokens.Colors.sessionGroupSolid : Tokens.Colors.sessionPrivateSolid)
                            .opacity(block.isPast ? 0.4 : 1)
                    }
                    .buttonStyle(.plain)
                    .frame(width: max(6, proxy.size.width * block.width - 2), height: blockHeight)
                    .offset(x: proxy.size.width * block.left, y: CGFloat(block.stack) * (blockHeight + 1))
                    .accessibilityLabel(block.label)
                    .accessibilityIdentifier("today.studio.block.\(block.id)")
                }
            }
        }
        .frame(height: CGFloat(lane.rowCount) * (blockHeight + 1) - 1)
        .background(alignment: .center) {
            Rectangle().fill(Tokens.Colors.bgSubtle).frame(height: 1)
        }
    }

    /// The now-line, across every lane's track.
    @ViewBuilder private func nowLine(_ timeline: StudioTimeline) -> some View {
        if let fraction = timeline.nowFraction {
            GeometryReader { proxy in
                let track = proxy.size.width - labelWidth - Tokens.Spacing.space2
                Rectangle()
                    .fill(Tokens.Colors.accentFill)
                    .frame(width: 2)
                    .offset(x: labelWidth + Tokens.Spacing.space2 + track * fraction)
            }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
            .accessibilityIdentifier("today.studio.now")
        }
    }

    private func axis(_ timeline: StudioTimeline) -> some View {
        GeometryReader { proxy in
            let track = proxy.size.width - labelWidth - Tokens.Spacing.space2
            ZStack(alignment: .topLeading) {
                ForEach(timeline.ticks, id: \.label) { tick in
                    Text(tick.label)
                        .font(.system(Tokens.TextStyle.caption).monospacedDigit())
                        .foregroundStyle(Tokens.Colors.textSecondary)
                        .fixedSize()
                        .offset(x: labelWidth + Tokens.Spacing.space2 + track * tick.fraction - 8)
                }
            }
        }
        .frame(height: 16)
        .accessibilityHidden(true)
    }
}

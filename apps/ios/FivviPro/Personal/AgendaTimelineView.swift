import SwiftUI
import FivviDesignTokens
import FivviStrings
import FivviUI

/// *Dag* on Agenda (TD-04): the selected day as a timeline, an hour a row, each session a block in its type's colour with
/// its name and its start, sessions at the same time side by side, a cancelled one marked *Geannuleerd*, and the now-line
/// on today. A block opens TD-02 or TD-03 of the session.
struct DayTimelineView: View {
    let timeline: AgendaTimeline
    let catalog: Catalog
    let now: Date
    let onOpen: (PersonalRow) -> Void

    private let hourHeight: CGFloat = 56
    private let labelWidth: CGFloat = 52
    private let inset: CGFloat = 10

    private func offset(_ minutes: Int) -> CGFloat { inset + CGFloat(minutes) / 60 * hourHeight }

    var body: some View {
        GeometryReader { proxy in
            let width = max(0, proxy.size.width - labelWidth - Tokens.Spacing.space3)
            ZStack(alignment: .topLeading) {
                hourLines
                ForEach(timeline.blocks) { block in
                    blockView(block, width: width)
                }
                nowLine(width: width)
            }
        }
        .frame(height: offset(timeline.totalMinutes) + inset)
        .padding(.horizontal, Tokens.Spacing.space3)
        .background(
            Tokens.Colors.bgSurface,
            in: RoundedRectangle(cornerRadius: InsetGroupStyle.radius, style: .continuous)
        )
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("calendar.timeline")
    }

    private var hourLines: some View {
        ForEach(timeline.hours.indices, id: \.self) { index in
            HStack(alignment: .center, spacing: Tokens.Spacing.space2) {
                Text(timeline.hours[index])
                    .font(.system(Tokens.TextStyle.caption).monospacedDigit())
                    .foregroundStyle(Tokens.Colors.textSecondary)
                    .frame(width: labelWidth - Tokens.Spacing.space2, alignment: .trailing)
                Rectangle().fill(Tokens.Colors.borderDefault).frame(height: 0.5)
            }
            .offset(y: offset(index * 60) - 8)
            .accessibilityHidden(true)
        }
    }

    private func blockView(_ block: AgendaTimeline.Block, width: CGFloat) -> some View {
        let columnWidth = width / CGFloat(block.columns)
        let tone = tone(block.row)
        let metrics = timeline.metrics(for: block, hourHeight: hourHeight)
        return Button { onOpen(block.row) } label: {
            HStack(spacing: 0) {
                RoundedRectangle(cornerRadius: 2, style: .continuous).fill(tone.solid).frame(width: 3)
                    .padding(.vertical, 3)
                VStack(alignment: .leading, spacing: 0) {
                    Text(block.row.title)
                        .font(.system(Tokens.TextStyle.footnote, weight: .semibold))
                        .strikethrough(block.row.isCancelled)
                        .lineLimit(1)
                    Text(startLine(block.row))
                        .font(.system(Tokens.TextStyle.caption).monospacedDigit())
                        .lineLimit(1)
                }
                .foregroundStyle(tone.text)
                .padding(.horizontal, Tokens.Spacing.space2)
                Spacer(minLength: 0)
            }
            .frame(width: columnWidth - 3, height: metrics.height, alignment: .leading)
            .background(tone.fill, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .opacity(block.row.isPast || block.row.isCancelled ? 0.55 : 1)
            // A block under 44 pt is touched on 44 pt where there is room: above and below, never over the block beside
            // it; the look stays on the scale.
            .padding(.top, metrics.touchAbove)
            .padding(.bottom, metrics.touchBelow)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .offset(
            x: labelWidth + columnWidth * CGFloat(block.column), y: offset(block.top) - metrics.touchAbove
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(block.row.spokenLabel)
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("calendar.block.\(block.row.id)")
    }

    /// *11:00*, and *Geannuleerd* for a cancelled one, where a class says how many places are taken.
    private func startLine(_ row: PersonalRow) -> String {
        if row.isCancelled { return "\(row.startText) · \(catalog[.todayCancelled])" }
        return [row.startText, row.pill].compactMap { $0 }.joined(separator: " · ")
    }

    private struct Tone {
        let solid: Color
        let fill: Color
        let text: Color
    }

    private func tone(_ row: PersonalRow) -> Tone {
        row.isGroup
            ? Tone(
                solid: Tokens.Colors.sessionGroupSolid, fill: Tokens.Colors.sessionGroupBg,
                text: Tokens.Colors.sessionGroupText
            )
            : Tone(
                solid: Tokens.Colors.sessionPrivateSolid, fill: Tokens.Colors.sessionPrivateBg,
                text: Tokens.Colors.sessionPrivateText
            )
    }

    /// The now-line, on today, across the day.
    @ViewBuilder private func nowLine(width: CGFloat) -> some View {
        if let minutes = timeline.nowMinutes {
            ZStack(alignment: .leading) {
                Rectangle().fill(Tokens.Colors.accentFill).frame(width: width + 4, height: 2)
                Circle().fill(Tokens.Colors.accentFill).frame(width: 8, height: 8).offset(x: -4)
            }
            .offset(x: labelWidth - 4, y: offset(minutes) - 1)
            .allowsHitTesting(false)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(catalog.string(.calendarNow, SessionClock.localStart(now, in: PersonalRows.timeZone)))
            .accessibilityIdentifier("calendar.now")
        }
    }
}

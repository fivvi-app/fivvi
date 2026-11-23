import Foundation

/// *Dag* on Agenda (TD-04, `DECISIONS.md` §3): the selected day as a timeline with an hour a row, from the first to the
/// last hour of the day, each session a block, sessions at the same time side by side and the now-line on today. Only where
/// a block sits is decided here (minutes from the first row, its column); the sessions are the API's.
struct AgendaTimeline: Equatable {
    /// A session to place: its row, and the instants that say where it sits.
    struct Entry {
        let row: PersonalRow
        let startsAt: Date
        let endsAt: Date
    }

    struct Block: Identifiable, Equatable {
        var id: String { row.id }
        /// The session as a row: a block opens TD-02 or TD-03 by it.
        let row: PersonalRow
        /// Where it starts and how long it is, in minutes from the first row.
        let top: Int
        let length: Int
        /// The column it takes of the `columns` sessions at the same time share the width of the day.
        let column: Int
        let columns: Int
    }

    /// The labels of the hour lines, *09:00*, from the first to the last.
    let hours: [String]
    let blocks: [Block]
    /// Where the now-line sits, in minutes from the first row: on today only.
    let nowMinutes: Int?
    /// The minutes the rows span.
    var totalMinutes: Int { (hours.count - 1) * 60 }

    /// How tall a block looks and how much of the day it may be touched on. The look follows the minute scale (with a
    /// floor so a title still fits); a block under the 44 pt of a touch (`size.touch-min`) gets its hit area grown
    /// above and below it, so the look and the scale stay.
    struct BlockMetrics: Equatable {
        static let minimumHeight: CGFloat = 28
        static let touchMinimum: CGFloat = 44
        /// The gap under a block, so two one after the other are two.
        static let gap: CGFloat = 3

        let height: CGFloat
        /// What is added above and below the block to reach the touch size.
        let touchInset: CGFloat

        init(minutes: Int, hourHeight: CGFloat) {
            height = max(Self.minimumHeight, CGFloat(minutes) / 60 * hourHeight - Self.gap)
            touchInset = max(0, (Self.touchMinimum - height) / 2)
        }

        var touchHeight: CGFloat { height + 2 * touchInset }
    }
}

extension AgendaTimeline {
    private struct Placed {
        let entry: Entry
        let start: Int
        let end: Int
    }

    /// The timeline of `day`, or nil for a day without sessions. On today the rows reach the hour of now, so the line is
    /// on them.
    static func make(entries: [Entry], day: String, now: Date, calendar: AgendaCalendar) -> AgendaTimeline? {
        guard !entries.isEmpty else { return nil }
        // A session is placed by its start and its real length, so a day with the clocks changing keeps its durations.
        let placed = entries.map { entry -> Placed in
            let start = calendar.minuteOfDay(entry.startsAt)
            let length = max(1, Int((entry.endsAt.timeIntervalSince(entry.startsAt) / 60).rounded()))
            return Placed(entry: entry, start: start, end: min(24 * 60, start + length))
        }
        .sorted { ($0.start, $0.end) < ($1.start, $1.end) }

        let isToday = calendar.day(of: now) == day
        let nowMinute = calendar.minuteOfDay(now)
        var first = (placed.map(\.start).min() ?? 0) / 60
        var last = ((placed.map(\.end).max() ?? 0) + 59) / 60
        if isToday {
            first = min(first, nowMinute / 60)
            last = max(last, min(24, nowMinute / 60 + 1))
        }
        let origin = first * 60
        return AgendaTimeline(
            hours: (first...last).map { String(format: "%02d:00", $0 % 24) },
            blocks: columns(placed, origin: origin),
            nowMinutes: isToday ? nowMinute - origin : nil
        )
    }

    /// Gives every session a column: sessions that overlap, one after the other (not only two at the same moment), share
    /// the width of the day among as many columns as the most of them at once need.
    private static func columns(_ placed: [Placed], origin: Int) -> [Block] {
        var blocks: [Block] = []
        var group: [(placed: Placed, column: Int)] = []
        var columnEnds: [Int] = []
        var groupEnd = 0

        func flush() {
            blocks += group.map { member in
                Block(
                    row: member.placed.entry.row, top: member.placed.start - origin,
                    length: member.placed.end - member.placed.start, column: member.column, columns: columnEnds.count
                )
            }
            group = []
            columnEnds = []
        }

        for session in placed {
            if session.start >= groupEnd { flush() }
            let column = columnEnds.firstIndex { $0 <= session.start } ?? columnEnds.count
            if column == columnEnds.count { columnEnds.append(session.end) } else { columnEnds[column] = session.end }
            group.append((session, column))
            groupEnd = max(groupEnd, session.end)
        }
        flush()
        return blocks
    }
}

import Foundation

/// *Dag* on Agenda (TD-04, `DECISIONS.md` §3): the selected day as a timeline with an hour a row, from the first to the
/// last hour of the day, each session a block, sessions at the same time side by side and the now-line on today. Only where
/// a block sits is decided here (minutes from the first row, its column); the sessions are the API's.
///
/// A block is drawn at least `BlockMetrics.minimumHeight` tall, so a title still fits, and that is what decides the
/// columns: two sessions sit side by side when their own times overlap or their drawn blocks do, so also when the sessions
/// themselves don't overlap (a session of 15 minutes is drawn as 30). Splitting by the sessions' own times drew such a
/// block under the next one (#1556); the Android twin places the same way.
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
    /// The minutes a block is drawn past the last row, so the rows can leave room for it.
    var overflowMinutes: Int = 0
    /// One hour of the day is this tall, in points.
    static let hourHeight: CGFloat = 56
    /// The minutes the rows span.
    var totalMinutes: Int { (hours.count - 1) * 60 }

    /// How tall a block looks and how much of the day it may be touched on. The look follows the minute scale (with a
    /// floor so a title still fits); a block under the 44 pt of a touch (HIG, `apps/ios/README.md`) gets its hit area
    /// grown above and below it, where there is room, so the look and the scale stay. The hit area never goes past half
    /// of the room to the block over the same part of the width, so it never covers another block; a block with a
    /// neighbour close by may keep less than 44 pt.
    struct BlockMetrics: Equatable {
        static let minimumHeight: CGFloat = 28
        static let touchMinimum: CGFloat = 44
        /// The gap under a block, so two one after the other are two.
        static let gap: CGFloat = 3

        let height: CGFloat
        /// What is wanted above and below the block to reach the touch size.
        let touchInset: CGFloat
        /// What is added above and below it: `touchInset`, or less where a block is near.
        let touchAbove: CGFloat
        let touchBelow: CGFloat

        /// `roomAbove` and `roomBelow` are the free points to the nearest block beside it (nil for none).
        init(minutes: Int, hourHeight: CGFloat, roomAbove: CGFloat? = nil, roomBelow: CGFloat? = nil) {
            height = Self.height(minutes: minutes, hourHeight: hourHeight)
            let wanted = max(0, (Self.touchMinimum - height) / 2)
            touchInset = wanted
            touchAbove = roomAbove.map { min(wanted, max(0, $0) / 2) } ?? wanted
            touchBelow = roomBelow.map { min(wanted, max(0, $0) / 2) } ?? wanted
        }

        var touchHeight: CGFloat { height + touchAbove + touchBelow }

        /// How tall a block of `minutes` is drawn.
        static func height(minutes: Int, hourHeight: CGFloat) -> CGFloat {
            max(minimumHeight, CGFloat(minutes) / 60 * hourHeight - gap)
        }

        /// The minutes a block of `minutes` is drawn over, rounded up to a whole minute.
        static func drawnMinutes(_ minutes: Int, hourHeight: CGFloat) -> Int {
            Int((height(minutes: minutes, hourHeight: hourHeight) / hourHeight * 60).rounded(.up))
        }
    }

    /// The look and the hit area of `block`, with the room to the blocks over the same part of the width.
    func metrics(for block: Block, hourHeight: CGFloat) -> BlockMetrics {
        func top(_ block: Block) -> CGFloat { CGFloat(block.top) / 60 * hourHeight }
        func bottom(_ block: Block) -> CGFloat {
            top(block) + BlockMetrics.height(minutes: block.length, hourHeight: hourHeight)
        }
        let beside = blocks.filter { $0.id != block.id && $0.sharesWidth(with: block) }
        let roomAbove = beside.filter { $0.top <= block.top }.map { top(block) - bottom($0) }.min()
        let roomBelow = beside.filter { $0.top > block.top }.map { top($0) - bottom(block) }.min()
        return BlockMetrics(minutes: block.length, hourHeight: hourHeight, roomAbove: roomAbove, roomBelow: roomBelow)
    }
}

extension AgendaTimeline.Block {
    /// Whether the two take any of the same width of the day (a column of `columns` is a `1/columns` slice of it).
    func sharesWidth(with other: AgendaTimeline.Block) -> Bool {
        column * other.columns < (other.column + 1) * columns && other.column * columns < (column + 1) * other.columns
    }
}

extension AgendaTimeline {
    private struct Placed {
        let entry: Entry
        let start: Int
        let end: Int
        /// Where its column ends: the later of its real end and where its drawn block ends, so a clash always shows.
        let columnEnd: Int
    }

    /// The timeline of `day`, or nil for a day without sessions. On today the rows reach the hour of now, so the line is
    /// on them.
    static func make(
        entries: [Entry], day: String, now: Date, calendar: AgendaCalendar
    ) -> AgendaTimeline? {
        guard !entries.isEmpty else { return nil }
        // A session is placed by its start and its real length, so a day with the clocks changing keeps its durations.
        let placed = entries.map { entry -> Placed in
            let start = calendar.minuteOfDay(entry.startsAt)
            let length = max(1, Int((entry.endsAt.timeIntervalSince(entry.startsAt) / 60).rounded()))
            let end = min(24 * 60, start + length)
            let drawn = BlockMetrics.drawnMinutes(end - start, hourHeight: Self.hourHeight)
            return Placed(entry: entry, start: start, end: end, columnEnd: max(end, start + drawn))
        }
        .sorted { ($0.start, $0.end) < ($1.start, $1.end) }

        let isToday = calendar.day(of: now) == day
        let nowMinute = calendar.minuteOfDay(now)
        var first = (placed.map(\.start).min() ?? 0) / 60
        let columnEnd = placed.map(\.columnEnd).max() ?? 0
        var last = min(24, (columnEnd + 59) / 60)
        if isToday {
            first = min(first, nowMinute / 60)
            last = max(last, min(24, nowMinute / 60 + 1))
        }
        let origin = first * 60
        return AgendaTimeline(
            hours: (first...last).map { String(format: "%02d:00", $0 % 24) },
            blocks: columns(placed, origin: origin),
            nowMinutes: isToday ? nowMinute - origin : nil,
            overflowMinutes: max(0, columnEnd - last * 60)
        )
    }

    /// Gives every session a column: sessions whose times or drawn blocks overlap, one after the other (not only two at
    /// the same moment), share the width of the day among as many columns as the most of them at once need.
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
            if column == columnEnds.count {
                columnEnds.append(session.columnEnd)
            } else {
                columnEnds[column] = session.columnEnd
            }
            group.append((session, column))
            groupEnd = max(groupEnd, session.columnEnd)
        }
        flush()
        return blocks
    }
}

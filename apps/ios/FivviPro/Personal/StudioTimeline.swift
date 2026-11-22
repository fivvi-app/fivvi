import Foundation
import FivviAPI
import FivviStrings

/// *Hele studio* (F014, `DECISIONS.md` §3, the prototype's team card): one lane per trainer along one time axis, the
/// sessions as blocks in their type's colour, sessions of one trainer at the same time stacked in the lane, and a mark every
/// three hours. Only what is drawn is decided here (where a block sits, which row of the lane it takes); the day and the
/// busiest moment are the API's.
struct StudioTimeline: Equatable {
    struct Tick: Equatable {
        /// The hour, `07`.
        let label: String
        /// Where it sits on the axis, 0 to 1.
        let fraction: Double
    }

    struct Block: Identifiable, Equatable {
        var id: String { row.id }
        /// The session as a row: it opens TD-02 or TD-03 by it.
        let row: PersonalRow
        /// Where the block starts and how wide it is, as shares of the axis (0 to 1).
        let left: Double
        let width: Double
        /// The row of the lane the block sits in: sessions at the same time sit under each other.
        let stack: Int
        let isGroup: Bool
        let isPast: Bool
        /// "Sarah de Boer: Kracht 10:00", its accessible name.
        let label: String
    }

    struct Lane: Identifiable, Equatable {
        let id: String
        /// *Jij* for the Owner, a trainer's first name, or *Geen trainer*.
        let title: String
        /// The name the avatar's initials come from; nil for the lane of sessions that have no trainer.
        let avatarName: String?
        let isOwn: Bool
        let blocks: [Block]
        /// The rows the sessions at the same time need.
        let rowCount: Int
    }

    let ticks: [Tick]
    let lanes: [Lane]
    /// The now-line, when now is on the axis.
    let nowFraction: Double?
    /// Lanes of a trainer (the lane of nobody is not one).
    var trainerCount: Int { lanes.filter { $0.avatarName != nil }.count }
}

extension StudioTimeline {
    typealias Item = Components.Schemas.WorkspaceCalendarSession

    /// What the lanes are worded with: who the Owner is, how an item is a row (a block opens by it), and the label of the
    /// lane of sessions with no trainer.
    struct Context {
        let ownID: String
        let catalog: Catalog
        let nobody: String
        let rows: (Item) -> PersonalRow
    }

    /// A session on the axis: its start and end as minutes of the day.
    private struct Placed {
        let item: Item
        let start: Int
        let end: Int
        var trainerID: String { item.trainer?.value1.id ?? StudioTimeline.nobodyKey }
    }

    /// The timeline of the sessions that take place (`items`: no cancelled one, no Open Gym), or nil for none.
    static func make(items: [Item], timeZone: TimeZone, now: Date, context: Context) -> StudioTimeline? {
        guard !items.isEmpty else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        func minutes(_ date: Date) -> Int {
            let parts = calendar.dateComponents([.hour, .minute], from: date)
            return (parts.hour ?? 0) * 60 + (parts.minute ?? 0)
        }
        // A session is placed by its start and its length, so a day with the clocks changing keeps real durations.
        let placed = items.map { item -> Placed in
            let start = minutes(item.startsAt)
            let length = max(1, Int((item.endsAt.timeIntervalSince(item.startsAt) / 60).rounded()))
            return Placed(item: item, start: start, end: min(24 * 60, start + length))
        }
        let firstHour = (placed.map(\.start).min() ?? 0) / 60
        let lastHour = ((placed.map(\.end).max() ?? 0) + 59) / 60
        let endHour = min(24, max(firstHour + 9, lastHour))
        let range = Double((endHour - firstHour) * 60)
        let share = { (minute: Int) in Double(minute - firstHour * 60) / range }

        let ticks = stride(from: firstHour, through: endHour, by: 3).map {
            Tick(label: String(format: "%02d", $0), fraction: Double($0 - firstHour) / Double(endHour - firstHour))
        }
        let keys = placed.reduce(into: [String]()) { keys, entry in
            if !keys.contains(entry.trainerID) { keys.append(entry.trainerID) }
        }
        let lanes = keys.map { key in
            lane(key: key, entries: placed.filter { $0.trainerID == key }, context: context, share: share)
        }
        let nowShare = share(minutes(now))
        let onAxis = calendar.isDate(now, inSameDayAs: items[0].startsAt) && (0...1).contains(nowShare)
        return StudioTimeline(ticks: ticks, lanes: ordered(lanes), nowFraction: onAxis ? nowShare : nil)
    }

    private static let nobodyKey = "none"

    /// The Owner's lane first, then the trainers by name, and the lane of nobody last.
    private static func ordered(_ lanes: [Lane]) -> [Lane] {
        func rank(_ lane: Lane) -> Int { lane.isOwn ? 0 : lane.avatarName == nil ? 2 : 1 }
        return lanes.sorted { lhs, rhs in
            if rank(lhs) != rank(rhs) { return rank(lhs) < rank(rhs) }
            return (lhs.avatarName ?? "").localizedCaseInsensitiveCompare(rhs.avatarName ?? "") == .orderedAscending
        }
    }

    private static func lane(key: String, entries: [Placed], context: Context, share: (Int) -> Double) -> Lane {
        let trainer = entries.first?.item.trainer?.value1
        let isOwn = key == context.ownID
        var stacks: [[Range<Int>]] = []
        let blocks = entries.map { entry -> Block in
            let span = entry.start..<entry.end
            var stack = 0
            while stack < stacks.count, stacks[stack].contains(where: { $0.overlaps(span) }) { stack += 1 }
            if stack == stacks.count { stacks.append([]) }
            stacks[stack].append(span)
            let row = context.rows(entry.item)
            return Block(
                row: row, left: share(entry.start), width: share(entry.end) - share(entry.start), stack: stack,
                isGroup: row.isGroup, isPast: row.isPast,
                label: context.catalog.string(.studioBlock, row.startText, row.title, trainer?.name ?? context.nobody)
            )
        }
        let firstName = trainer.map { String($0.name.split(separator: " ").first ?? "") }
        return Lane(
            id: key, title: isOwn ? context.catalog[.studioYou] : firstName ?? context.nobody,
            avatarName: trainer?.name, isOwn: isOwn, blocks: blocks, rowCount: max(1, stacks.count)
        )
    }
}

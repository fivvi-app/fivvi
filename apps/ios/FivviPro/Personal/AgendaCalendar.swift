import Foundation

/// The days of Agenda (TD-04, F013): weeks and month grids Monday first, the ISO week number, and the days the clocks
/// change. A day is the API's `YYYY-MM-DD`, in Dutch time, and everything here goes by that wall clock (ADR-012): a
/// day is a day when it has 23 or 25 hours.
struct AgendaCalendar {
    /// A day the clocks change: *wintertijd* in autumn, *zomertijd* in spring.
    enum ClockChange: Equatable {
        case back, forward
    }

    let timeZone: TimeZone
    private let calendar: Calendar

    init(timeZone: TimeZone) {
        self.timeZone = timeZone
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        calendar.firstWeekday = 2
        calendar.minimumDaysInFirstWeek = 4
        self.calendar = calendar
    }

    // MARK: Days

    /// The start of the day `day`, or nil for text that is no date.
    func start(of day: String) -> Date? {
        let parts = day.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        let components = DateComponents(
            timeZone: timeZone, year: parts[0], month: parts[1], day: parts[2], hour: 0, minute: 0
        )
        guard let date = calendar.date(from: components), self.day(of: date) == day else { return nil }
        return date
    }

    /// The day an instant is on, in Dutch time.
    func day(of date: Date) -> String { SessionClock.localDate(date, in: timeZone) }

    /// The day `count` days after `day` (before, when negative), by the wall clock.
    func adding(days count: Int, to day: String) -> String {
        guard let begin = start(of: day), let moved = calendar.date(byAdding: .day, value: count, to: begin) else {
            return day
        }
        return self.day(of: moved)
    }

    /// The same day of another month, or the last day of it when that month is shorter.
    func adding(months count: Int, to day: String) -> String {
        guard let begin = start(of: day), let moved = calendar.date(byAdding: .month, value: count, to: begin) else {
            return day
        }
        return self.day(of: moved)
    }

    // MARK: Weeks and months

    /// The seven days of the week `day` is in, Monday first.
    func week(of day: String) -> [String] {
        guard let begin = start(of: day), let interval = calendar.dateInterval(of: .weekOfYear, for: begin) else {
            return [day]
        }
        let monday = self.day(of: interval.start)
        return (0..<7).map { adding(days: $0, to: monday) }
    }

    /// The ISO number of the week `day` is in (week 1 has the year's first Thursday).
    func weekNumber(of day: String) -> Int {
        start(of: day).map { calendar.component(.weekOfYear, from: $0) } ?? 0
    }

    /// The days of a month grid: the whole weeks from the one with the 1st to the one with the last day, so five rows
    /// mostly and six at most (42 days, what one request may ask for).
    func monthGrid(of day: String) -> [String] {
        guard let begin = start(of: day), let month = calendar.dateInterval(of: .month, for: begin),
              let lastDay = calendar.date(byAdding: .day, value: -1, to: month.end)
        else { return [day] }
        let first = week(of: self.day(of: month.start))[0]
        let last = week(of: self.day(of: lastDay))[6]
        var days: [String] = []
        var next = first
        while next <= last {
            days.append(next)
            next = adding(days: 1, to: next)
        }
        return days
    }

    /// Whether `day` is in the month `other` is in: the days of the grid outside it are dimmed.
    func isInMonth(_ day: String, of other: String) -> Bool { day.prefix(7) == other.prefix(7) }

    /// The wall-clock time of an instant as minutes since midnight: 09:30 is 570.
    func minuteOfDay(_ date: Date) -> Int {
        let parts = calendar.dateComponents([.hour, .minute], from: date)
        return (parts.hour ?? 0) * 60 + (parts.minute ?? 0)
    }

    /// The number of the day in its month, `22`.
    func dayNumber(of day: String) -> Int { Int(day.suffix(2)) ?? 0 }

    // MARK: The clocks

    /// Whether the clocks change on `day`: the offset to UTC at its start differs from the one at the next day's start.
    func clockChange(on day: String) -> ClockChange? {
        guard let begin = start(of: day), let next = start(of: adding(days: 1, to: day)) else { return nil }
        let before = timeZone.secondsFromGMT(for: begin)
        let after = timeZone.secondsFromGMT(for: next)
        if after > before { return .forward }
        if after < before { return .back }
        return nil
    }

    /// The days among `days` the clocks change on, with how.
    func clockChanges(in days: [String]) -> [(day: String, change: ClockChange)] {
        days.compactMap { day in clockChange(on: day).map { (day, $0) } }
    }
}

import Foundation

/// The date and the time of day the session forms send (`localDate` `YYYY-MM-DD`, `localStart` `HH:mm`), read from an
/// instant in the workspace's time zone, and the end time the forms show. The API decides every rule about them (a
/// time the clocks skip, a past start, ADR-012); nothing here refuses a time, it only writes down what was chosen.
enum SessionClock {
    private static func calendar(_ timeZone: TimeZone) -> Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        return calendar
    }

    private static func format(_ date: Date, _ pattern: String, in timeZone: TimeZone) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = calendar(timeZone)
        formatter.timeZone = timeZone
        formatter.dateFormat = pattern
        return formatter.string(from: date)
    }

    /// `2026-11-16`: the day of `date` in `timeZone`.
    static func localDate(_ date: Date, in timeZone: TimeZone) -> String {
        format(date, "yyyy-MM-dd", in: timeZone)
    }

    /// `09:30`, 24 hours: the time of day of `date` in `timeZone`.
    static func localStart(_ date: Date, in timeZone: TimeZone) -> String {
        format(date, "HH:mm", in: timeZone)
    }

    /// The end of a session that starts at `start` and lasts `minutes`: its time, and whether it is on another day than
    /// the start.
    static func end(of start: Date, minutes: Int, in timeZone: TimeZone) -> (time: String, nextDay: Bool) {
        let end = start.addingTimeInterval(TimeInterval(minutes * 60))
        return (localStart(end, in: timeZone), localDate(end, in: timeZone) != localDate(start, in: timeZone))
    }

    /// The form's first start: the next whole hour after `now`.
    static func nextFullHour(after now: Date, in timeZone: TimeZone) -> Date {
        let calendar = calendar(timeZone)
        let hour = calendar.dateInterval(of: .hour, for: now)?.start ?? now
        return calendar.date(byAdding: .hour, value: 1, to: hour) ?? now
    }

    /// The minutes between two instants, as the API's `durationMinutes` of a stored session.
    static func minutes(from start: Date, to end: Date) -> Int {
        Int((end.timeIntervalSince(start) / 60).rounded())
    }
}

/// How the session screens write a date and a time: in the interface language's formatting locale and the workspace's
/// time zone (ADR-012).
struct SessionFormat {
    let locale: Locale
    let timeZone: TimeZone

    private func formatted(_ date: Date, template: String) -> String {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeZone = timeZone
        formatter.setLocalizedDateFormatFromTemplate(template)
        return formatter.string(from: date)
    }

    /// *do 24 sep*, as the web words it.
    func day(_ date: Date) -> String { formatted(date, template: "EEEdMMM") }

    /// *donderdag*, the weekday of a date.
    func weekday(_ date: Date) -> String { formatted(date, template: "EEEE") }

    /// *donderdag*, the weekday that `number` names the way `Calendar` numbers them: 1 is Sunday, 2 Monday.
    func weekdayName(number: Int) -> String {
        let formatter = DateFormatter()
        formatter.locale = locale
        let names = formatter.weekdaySymbols ?? []
        return names.indices.contains(number - 1) ? names[number - 1] : ""
    }

    /// *do 28 mrt*, written from a local date `YYYY-MM-DD` as the API names it; nil for text that is no date.
    func day(localDate: String) -> String? {
        let parser = DateFormatter()
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.timeZone = timeZone
        parser.dateFormat = "yyyy-MM-dd HH:mm"
        return parser.date(from: "\(localDate) 12:00").map(day)
    }

    /// *donderdag 24 september 2026*
    func longDay(_ date: Date) -> String { formatted(date, template: "EEEEdMMMMy") }

    /// *do 24 sep 2026*
    func dayYear(_ date: Date) -> String { formatted(date, template: "EEEdMMMy") }

    /// *09:30*, 24 hours.
    func time(_ date: Date) -> String { SessionClock.localStart(date, in: timeZone) }
}

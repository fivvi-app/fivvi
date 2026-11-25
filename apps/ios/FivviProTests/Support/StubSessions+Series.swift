import Foundation
import FivviAPI

/// The dates of a class a request makes (F022): the one, or, for a weekly repeat, 12 on the same weekday and wall-clock
/// time (Europe/Amsterdam), each with its series, as `POST …/group-classes` stores them.
extension StubSessions {
    private static let zoneName = "Europe/Amsterdam"
    private static let weekdays: [Components.Schemas.SessionSeries.WeekdayPayload] = [
        .su, .mo, .tu, .we, .th, .fr, .sa
    ]

    func addGroupDates(
        of made: Components.Schemas.GroupClass, from start: Date, weekly: Bool,
        body: Components.Schemas.CreateGroupClassRequest, trainer: Components.Schemas.SessionTrainer?
    ) -> [Session] {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: Self.zoneName) ?? .current
        let weekday = Self.weekdays[calendar.component(.weekday, from: start) - 1]
        return (0..<(weekly ? 12 : 1)).compactMap { week in
            calendar.date(byAdding: .weekOfYear, value: week, to: start).map { date in
                addGroupDate(
                    of: made, start: date, minutes: body.durationMinutes, capacity: body.capacity, trainer: trainer,
                    series: weekly ? .init(
                        id: "5e1c2d3e-0000-4000-8000-000000000001", weekday: weekday,
                        localStartTime: Self.local(start, "HH:mm"), occurrenceDate: Self.local(date, "yyyy-MM-dd"),
                        changedFields: []
                    ) : nil,
                    level: made.level
                )
            }
        }
    }

    private static func local(_ date: Date, _ pattern: String) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: zoneName)
        formatter.dateFormat = pattern
        return formatter.string(from: date)
    }
}

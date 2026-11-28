import FivviAPI

extension Components.Schemas.SessionSeries.WeekdayPayload {
    /// The number `Calendar` gives the weekday: 1 is Sunday, 2 Monday.
    var number: Int {
        switch self {
        case .su: 1
        case .mo: 2
        case .tu: 3
        case .we: 4
        case .th: 5
        case .fr: 6
        case .sa: 7
        }
    }
}

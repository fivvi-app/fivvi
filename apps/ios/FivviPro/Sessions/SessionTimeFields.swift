import Foundation
import Observation
import FivviAPI
import FivviStrings

/// What PS-04 and PS-05 say about the time: a start (date and time of day), a length, and the texts around them. The
/// API refuses what the calendar doesn't have (30 February, a start the clocks skip) and the form words its refusal
/// under the field, the same words as the web; nothing here decides a rule.
@MainActor
@Observable
final class SessionTimeFields {
    /// The lengths of the buttons; any other is chosen from the list (`otherDurations`).
    static let chips = [45, 60, 90]
    /// The lengths the API accepts: 15 to 240 minutes in steps of 5 (`durationMinutes` in the contract).
    static let otherDurations = Array(stride(from: 15, through: 240, by: 5))

    /// A start the clocks skip, or a date or time that doesn't exist, as the API refused it.
    enum Refusal: Equatable {
        case invalidDate
        case invalidTime
        case timeDoesNotExist
    }

    var start: Date
    var durationMinutes: Int
    /// *Andere duur* is chosen, or the length is not one of the buttons.
    private var otherChosen: Bool
    private(set) var refusal: Refusal?
    let timeZone: TimeZone
    private(set) var catalog: Catalog

    init(start: Date, durationMinutes: Int, timeZone: TimeZone, catalog: Catalog) {
        self.start = start
        self.durationMinutes = durationMinutes
        self.timeZone = timeZone
        self.catalog = catalog
        otherChosen = !Self.chips.contains(durationMinutes)
    }

    var localDate: String { SessionClock.localDate(start, in: timeZone) }
    var localStart: String { SessionClock.localStart(start, in: timeZone) }
    var format: SessionFormat { SessionFormat(locale: catalog.formattingLocale, timeZone: timeZone) }

    /// The segmented control's value: the length of a button, or 0 for *Andere duur*.
    var durationChoice: Int {
        get { otherChosen ? 0 : durationMinutes }
        set {
            otherChosen = newValue == 0
            if newValue != 0 { durationMinutes = newValue }
        }
    }

    var showsOtherDurations: Bool { otherChosen }

    func durationText(_ minutes: Int) -> String { catalog.string(.sessionFormDurationMinutes, String(minutes)) }

    /// *Eindigt om 10:00* or *Eindigt om 00:30 (volgende dag)*.
    var endsAtText: String {
        let end = SessionClock.end(of: start, minutes: durationMinutes, in: timeZone)
        return catalog.string(end.nextDay ? .sessionFormEndsAtNextDay : .sessionFormEndsAt, end.time)
    }

    /// What the API refused about the date or the start, in words.
    var refusalText: String? {
        switch refusal {
        case .invalidDate: catalog[.sessionErrorsInvalidDate]
        case .invalidTime: catalog[.sessionErrorsInvalidTime]
        case .timeDoesNotExist: catalog.string(.sessionErrorsTimeDoesNotExist, format.day(start))
        case nil: nil
        }
    }

    /// The `400` of the API: the first of its issues on the date or the start (`time_does_not_exist` is its own).
    func refuse(_ issues: [Components.Schemas.ValidationError.IssuesPayloadPayload]) -> Bool {
        for issue in issues {
            // The class form's quick create nests the date: `firstDate.localDate`.
            if issue.path.hasSuffix("localDate") {
                refusal = .invalidDate
            } else if issue.path.hasSuffix("localStart") {
                refusal = issue.code == "time_does_not_exist" ? .timeDoesNotExist : .invalidTime
            }
        }
        return refusal != nil
    }

    func clearRefusal() { refusal = nil }

    func use(_ catalog: Catalog) { self.catalog = catalog }
}

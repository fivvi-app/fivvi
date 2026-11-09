import Foundation

/// The date above a large title (*Vandaag*): "zaterdag 7 november", set in capitals by the title block. It is formatted
/// in the language of the app and in the workspace's time zone, which is Europe/Amsterdam until a workspace has its own.
enum DateEyebrow {
    static let defaultTimeZone = TimeZone(identifier: "Europe/Amsterdam") ?? .gmt

    static func text(for date: Date, locale: Locale, timeZone: TimeZone = defaultTimeZone) -> String {
        var style = Date.FormatStyle(locale: locale, timeZone: timeZone)
        style.calendar.locale = locale
        return date.formatted(style.weekday(.wide).day().month(.wide))
    }
}

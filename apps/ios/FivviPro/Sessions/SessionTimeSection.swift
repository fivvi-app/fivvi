import SwiftUI
import FivviDesignTokens
import FivviStrings

/// The rows PS-04 and PS-05 share: the date, the start, the length (45, 60, 90 or another) and where the session ends.
/// The date and the time of day are one `Date` in the workspace's time zone; what the API refuses about them is worded
/// under the rows.
struct SessionTimeSection: View {
    @Bindable var time: SessionTimeFields
    let dateLabel: String
    let idPrefix: String

    private var catalog: Catalog { time.catalog }

    var body: some View {
        Section {
            DatePicker(dateLabel, selection: $time.start, displayedComponents: .date)
                .accessibilityIdentifier("\(idPrefix).date")
            DatePicker(catalog[.sessionFormStartLabel], selection: $time.start, displayedComponents: .hourAndMinute)
                .accessibilityIdentifier("\(idPrefix).start")
            durationRows
            Text(time.endsAtText)
                .font(.system(Tokens.TextStyle.body))
                .foregroundStyle(Tokens.Colors.textSecondary)
                .accessibilityIdentifier("\(idPrefix).endsAt")
        } footer: {
            if let refusal = time.refusalText {
                Text(refusal)
                    .font(.system(Tokens.TextStyle.footnote))
                    .foregroundStyle(Tokens.Colors.statusDangerFg)
                    .accessibilityIdentifier("\(idPrefix).timeError")
            }
        }
        .onChange(of: time.start) { time.clearRefusal() }
    }

    @ViewBuilder private var durationRows: some View {
        VStack(alignment: .leading, spacing: Tokens.Spacing.space2) {
            Text(catalog[.sessionFormDurationLabel])
                .font(.system(Tokens.TextStyle.label))
                .foregroundStyle(Tokens.Colors.textSecondary)
            Picker(catalog[.sessionFormDurationLabel], selection: $time.durationChoice) {
                ForEach(SessionTimeFields.chips, id: \.self) { minutes in
                    Text(time.durationText(minutes)).tag(minutes)
                }
                Text(catalog[.sessionFormDurationOther]).tag(0)
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("\(idPrefix).duration")
        }
        if time.showsOtherDurations {
            Picker(catalog[.sessionFormDurationOther], selection: $time.durationMinutes) {
                ForEach(SessionTimeFields.otherDurations, id: \.self) { minutes in
                    Text(time.durationText(minutes)).tag(minutes)
                }
            }
            .accessibilityIdentifier("\(idPrefix).durationOther")
        }
    }
}

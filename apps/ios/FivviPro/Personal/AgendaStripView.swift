import SwiftUI
import FivviDesignTokens
import FivviStrings

/// The strip of the week of *Dag* and *Week* (TD-04): the weekday letters, the day numbers with today marked and the
/// selected day filled, and under each day a dot per session in its type's colour. Under it the *Week 39 · …* line has ‹ ›
/// either side at 44 pt, as the month's name has, and a swipe goes to the other weeks too.
struct WeekStripView: View {
    let model: AgendaModel

    var body: some View {
        VStack(spacing: Tokens.Spacing.space1) {
            HStack(spacing: 0) {
                ForEach(model.strip) { cell in DayCellView(cell: cell, size: .week) { model.select(cell.day) } }
            }
            HStack(spacing: 0) {
                AgendaNavButton(
                    symbol: "chevron.backward", label: model.previousWeekLabel, id: "calendar.previous"
                ) { model.stepWeek(-1) }
                Text(model.weekLine)
                    .font(.system(Tokens.TextStyle.footnote, weight: .semibold))
                    .foregroundStyle(Tokens.Colors.textSecondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .accessibilityIdentifier("calendar.weekLine")
                AgendaNavButton(
                    symbol: "chevron.forward", label: model.nextWeekLabel, id: "calendar.next"
                ) { model.stepWeek(1) }
            }
        }
        .frame(maxWidth: .infinity)
        .contentShape(Rectangle())
        .simultaneousGesture(
            DragGesture(minimumDistance: 24).onEnded { value in
                let across = value.translation.width
                guard abs(across) > abs(value.translation.height) * 1.5 else { return }
                model.stepWeek(across < 0 ? 1 : -1)
            }
        )
    }
}

/// ‹ or › of the week line and of the month's name: a 44 × 44 pt touch (`size.touch-min`).
struct AgendaNavButton: View {
    static let side: CGFloat = 44

    let symbol: String
    let label: String
    let id: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(Tokens.TextStyle.body, weight: .semibold))
                .foregroundStyle(Tokens.Colors.accentText)
                .frame(width: Self.side, height: Self.side)
                .contentShape(Rectangle())
        }
        .accessibilityLabel(label)
        .accessibilityIdentifier(id)
    }
}

/// The month grid of *Maand* (TD-04): the month's name with ‹ ›, the weekday letters, the days Monday first with the days
/// of other months dimmed, and up to three dots a day.
struct MonthGridView: View {
    let model: AgendaModel

    var body: some View {
        VStack(spacing: Tokens.Spacing.space2) {
            header
            let letters = model.weekdayLetters
            HStack(spacing: 0) {
                ForEach(letters.indices, id: \.self) { index in
                    Text(letters[index])
                        .font(.system(Tokens.TextStyle.caption, weight: .semibold))
                        .foregroundStyle(Tokens.Colors.textSecondary)
                        .frame(maxWidth: .infinity)
                }
            }
            .accessibilityHidden(true)
            let cells = model.grid
            let rows = stride(from: 0, to: cells.count, by: 7).map { Array(cells[$0..<min($0 + 7, cells.count)]) }
            VStack(spacing: 0) {
                ForEach(rows.indices, id: \.self) { index in
                    HStack(spacing: 0) {
                        ForEach(rows[index]) { cell in
                            DayCellView(cell: cell, size: .month) { model.select(cell.day) }
                        }
                    }
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("calendar.grid")
        }
        .frame(maxWidth: .infinity)
        .simultaneousGesture(
            DragGesture(minimumDistance: 24).onEnded { value in
                let across = value.translation.width
                guard abs(across) > abs(value.translation.height) * 1.5 else { return }
                model.stepMonth(across < 0 ? 1 : -1)
            }
        )
    }

    private var header: some View {
        HStack {
            AgendaNavButton(
                symbol: "chevron.backward", label: model.previousMonthLabel, id: "calendar.previousMonth"
            ) { model.stepMonth(-1) }
            Spacer()
            Text(model.monthTitle)
                .font(.system(Tokens.TextStyle.title2, weight: .bold))
                .foregroundStyle(Tokens.Colors.textPrimary)
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier("calendar.monthTitle")
            Spacer()
            AgendaNavButton(
                symbol: "chevron.forward", label: model.nextMonthLabel, id: "calendar.nextMonth"
            ) { model.stepMonth(1) }
        }
    }
}

/// A day of the strip or of the month grid: its number, today marked, the selected one filled, and its dots.
struct DayCellView: View {
    enum Size {
        case week, month

        var circle: CGFloat { self == .week ? 38 : 34 }
        var dot: CGFloat { self == .week ? 5 : 4 }
    }

    let cell: AgendaModel.DayCell
    let size: Size
    let onSelect: () -> Void

    var body: some View {
        VStack(spacing: Tokens.Spacing.space1) {
            if size == .week {
                Text(cell.weekday)
                    .font(.system(Tokens.TextStyle.caption, weight: .semibold))
                    .foregroundStyle(Tokens.Colors.textSecondary)
                    .accessibilityHidden(true)
            }
            Button(action: onSelect) {
                Text(String(cell.number))
                    .font(.system(Tokens.TextStyle.body, weight: cell.isSelected || cell.isToday ? .bold : .medium))
                    .monospacedDigit()
                    .foregroundStyle(numberColour)
                    .frame(width: size.circle, height: size.circle)
                    .background(fill, in: Circle())
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(cell.label)
            .accessibilityAddTraits(cell.isSelected ? .isSelected : [])
            .accessibilityIdentifier("calendar.day.\(cell.day)")
            dots
        }
        .frame(maxWidth: .infinity)
        .opacity(cell.isOutsideMonth ? 0.4 : 1)
    }

    /// One dot per session in its type's colour. The name is how many there are; the id says which kinds, for a test.
    @ViewBuilder private var dots: some View {
        if let count = cell.countLabel {
            HStack(spacing: 3) {
                ForEach(cell.dots.indices, id: \.self) { index in
                    Circle().fill(cell.dots[index].dotColour).frame(width: size.dot, height: size.dot)
                }
            }
            .frame(height: 6)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(count)
            .accessibilityIdentifier("calendar.dots.\(cell.day).\(cell.dots.map(\.dotName).joined(separator: "-"))")
        } else {
            Color.clear.frame(height: 6)
        }
    }

    private var numberColour: Color {
        if cell.isSelected { return cell.isToday ? Tokens.Colors.accentOn : Tokens.Colors.textInverse }
        return cell.isToday ? Tokens.Colors.accentText : Tokens.Colors.textPrimary
    }

    private var fill: Color {
        guard cell.isSelected else { return Color.clear }
        return cell.isToday ? Tokens.Colors.accentFill : Tokens.Colors.bgInverse
    }
}

extension AgendaModel.Kind {
    /// The colour of a dot: the design tokens' blue for a private session, the purple for a class.
    var dotColour: Color {
        self == .group ? Tokens.Colors.sessionGroupSolid : Tokens.Colors.sessionPrivateSolid
    }

    /// What the dots' identifier says of a kind, for a test.
    var dotName: String { self == .group ? "group" : "private" }
}

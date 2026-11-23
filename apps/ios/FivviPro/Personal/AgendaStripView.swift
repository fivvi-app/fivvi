import SwiftUI
import FivviDesignTokens
import FivviStrings

/// The strip of the week of *Dag* and *Week* (TD-04): the weekday letters, the day numbers with today marked and the
/// selected day filled, and under each day a dot per session in its type's colour. ‹ › and a swipe go to the other weeks.
struct WeekStripView: View {
    let model: AgendaModel

    var body: some View {
        HStack(spacing: 0) {
            nav("chevron.backward", label: model.previousWeekLabel, id: "calendar.previous") { model.stepWeek(-1) }
            ForEach(model.strip) { cell in DayCellView(cell: cell, size: .week) { model.select(cell.day) } }
            nav("chevron.forward", label: model.nextWeekLabel, id: "calendar.next") { model.stepWeek(1) }
        }
        // The strip takes the width of the screen but 4 pt: seven days of at least 44 pt need more than the gutters leave.
        .padding(.horizontal, 4 - Tokens.Spacing.gutter)
        .contentShape(Rectangle())
        .simultaneousGesture(
            DragGesture(minimumDistance: 24).onEnded { value in
                let across = value.translation.width
                guard abs(across) > abs(value.translation.height) * 1.5 else { return }
                model.stepWeek(across < 0 ? 1 : -1)
            }
        )
    }

    private func nav(_ symbol: String, label: String, id: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(Tokens.TextStyle.body, weight: .semibold))
                .foregroundStyle(Tokens.Colors.accentText)
                .frame(width: 28, height: 44)
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
            nav("chevron.backward", label: model.previousMonthLabel, id: "calendar.previousMonth") {
                model.stepMonth(-1)
            }
            Spacer()
            Text(model.monthTitle)
                .font(.system(Tokens.TextStyle.title2, weight: .bold))
                .foregroundStyle(Tokens.Colors.textPrimary)
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier("calendar.monthTitle")
            Spacer()
            nav("chevron.forward", label: model.nextMonthLabel, id: "calendar.nextMonth") { model.stepMonth(1) }
        }
    }

    private func nav(_ symbol: String, label: String, id: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(Tokens.TextStyle.body, weight: .semibold))
                .foregroundStyle(Tokens.Colors.accentText)
                .frame(width: 44, height: 44)
        }
        .accessibilityLabel(label)
        .accessibilityIdentifier(id)
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
                    Circle().fill(colour(cell.dots[index])).frame(width: size.dot, height: size.dot)
                }
            }
            .frame(height: 6)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(count)
            .accessibilityIdentifier("calendar.dots.\(cell.day).\(cell.dots.map(name).joined(separator: "-"))")
        } else {
            Color.clear.frame(height: 6)
        }
    }

    private func colour(_ kind: AgendaModel.Kind) -> Color {
        kind == .group ? Tokens.Colors.sessionGroupSolid : Tokens.Colors.sessionPrivateSolid
    }

    private func name(_ kind: AgendaModel.Kind) -> String { kind == .group ? "group" : "private" }

    private var numberColour: Color {
        if cell.isSelected { return cell.isToday ? Tokens.Colors.accentOn : Tokens.Colors.textInverse }
        return cell.isToday ? Tokens.Colors.accentText : Tokens.Colors.textPrimary
    }

    private var fill: Color {
        guard cell.isSelected else { return Color.clear }
        return cell.isToday ? Tokens.Colors.accentFill : Tokens.Colors.bgInverse
    }
}

package app.fivvi.pro.personal

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag as semanticsTestTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.fivvi.core.R
import app.fivvi.core.kit.sessionColors
import app.fivvi.core.theme.numeric
import app.fivvi.core.theme.tokens
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.body
import app.fivvi.designtokens.caption
import app.fivvi.designtokens.footnote
import app.fivvi.designtokens.title2
import app.fivvi.pro.sessions.SessionFormat
import kotlin.math.abs

/** What a day of the strip or the grid draws: the circle round its number, and the dots under it. */
private enum class CellSize(val circle: Dp, val dot: Dp) {
    Week(38.dp, 5.dp),
    Month(34.dp, 4.dp),
}

/** A swipe has to go this far across, and more across than down, to turn the page. */
private val SwipeDistance = 48.dp

/** The weekday letters of the strip and the grid: *M D W D V Z Z*. */
@Composable
private fun WeekdayLetter(text: String, modifier: Modifier) {
    Text(
        text,
        modifier = modifier.clearAndSetSemantics { },
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        style = MaterialTheme.typography.caption.copy(fontWeight = FontWeight.SemiBold),
        textAlign = TextAlign.Center,
    )
}

/** Turns the page on a swipe across: left is the next week or month, right the one before. */
private fun Modifier.swipesBetweenPages(step: (Int) -> Unit): Modifier = composed {
    val current by rememberUpdatedState(step)
    val distance = with(LocalDensity.current) { SwipeDistance.toPx() }
    pointerInput(distance) {
        var across = 0f
        detectHorizontalDragGestures(
            onDragStart = { across = 0f },
            onDragEnd = { if (abs(across) > distance) current(if (across < 0) 1 else -1) },
            onDragCancel = { across = 0f },
        ) { _, amount -> across += amount }
    }
}

/**
 * ‹ or › of the week line and of the month's name: a touch target of at least 48 dp (Material), the arrow drawn smaller in
 * it.
 */
@Composable
fun AgendaNavButton(forward: Boolean, label: String, tag: String, onClick: () -> Unit) {
    IconButton(onClick = onClick, modifier = Modifier.size(NavSide).testTag(tag)) {
        Icon(
            painterResource(if (forward) R.drawable.ic_chevron_right else R.drawable.ic_chevron_left),
            contentDescription = label,
            tint = MaterialTheme.tokens.accentText,
        )
    }
}

/** The side of the arrows' touch area. */
val NavSide: Dp = 48.dp

/**
 * The strip of the week of *Dag* and *Week* (TD-04): the weekday letters, the day numbers with today marked and the selected
 * day filled, and under each day a dot per session in its type's colour. Under it the *Week 39 · …* line has ‹ › either
 * side at 48 dp, as the month's name has, and a swipe goes to the other weeks too.
 */
@Composable
fun WeekStrip(
    content: AgendaContent,
    format: SessionFormat,
    onSelect: (java.time.LocalDate) -> Unit,
    onStep: (Int) -> Unit,
) {
    val range = stringResource(
        R.string.my_calendar_range,
        format.dayMonthYear(content.weekDays.last()),
        format.dayMonth(content.weekDays.first()),
    )
    val line = stringResource(R.string.my_calendar_app_week_line, range, content.weekNumber.toString())
    Column(
        Modifier.fillMaxWidth().swipesBetweenPages(onStep),
        verticalArrangement = Arrangement.spacedBy(Spacing.space1),
    ) {
        Row(Modifier.fillMaxWidth()) {
            content.strip.forEach { cell ->
                DayCell(cell, CellSize.Week, format, onSelect, Modifier.weight(1f))
            }
        }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            AgendaNavButton(
                forward = false,
                label = stringResource(R.string.my_calendar_app_previous_week),
                tag = AgendaTags.PREVIOUS,
            ) { onStep(-1) }
            Text(
                line,
                modifier = Modifier.weight(1f).testTag(AgendaTags.WEEK_LINE),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.footnote.copy(fontWeight = FontWeight.SemiBold),
                textAlign = TextAlign.Center,
            )
            AgendaNavButton(
                forward = true,
                label = stringResource(R.string.my_calendar_app_next_week),
                tag = AgendaTags.NEXT,
            ) { onStep(1) }
        }
    }
}

/**
 * The month grid of *Maand* (TD-04): the month's name with ‹ ›, the weekday letters, the days Monday first with the days of
 * other months dimmed, and up to three dots a day.
 */
@Composable
fun MonthGrid(
    content: AgendaContent,
    format: SessionFormat,
    onSelect: (java.time.LocalDate) -> Unit,
    onStep: (Int) -> Unit,
) {
    Column(
        Modifier.fillMaxWidth().swipesBetweenPages(onStep),
        verticalArrangement = Arrangement.spacedBy(Spacing.space2),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            AgendaNavButton(
                forward = false,
                label = stringResource(R.string.my_calendar_app_previous_month),
                tag = AgendaTags.PREVIOUS_MONTH,
            ) { onStep(-1) }
            Text(
                content.monthTitle,
                modifier = Modifier.weight(1f).testTag(AgendaTags.MONTH_TITLE).semantics { heading() },
                style = MaterialTheme.typography.title2,
                textAlign = TextAlign.Center,
            )
            AgendaNavButton(
                forward = true,
                label = stringResource(R.string.my_calendar_app_next_month),
                tag = AgendaTags.NEXT_MONTH,
            ) { onStep(1) }
        }
        Row(Modifier.fillMaxWidth()) {
            content.weekdayLetters.forEach { WeekdayLetter(it, Modifier.weight(1f)) }
        }
        Column(Modifier.fillMaxWidth().testTag(AgendaTags.GRID)) {
            content.grid.chunked(WEEK).forEach { week ->
                Row(Modifier.fillMaxWidth()) {
                    week.forEach { cell -> DayCell(cell, CellSize.Month, format, onSelect, Modifier.weight(1f)) }
                }
            }
        }
    }
}

private const val WEEK = 7

/** A day of the strip or of the month grid: its number, today marked, the selected one filled, and its dots. */
@Composable
private fun DayCell(
    cell: AgendaDayCell,
    size: CellSize,
    format: SessionFormat,
    onSelect: (java.time.LocalDate) -> Unit,
    modifier: Modifier,
) {
    val tokens = MaterialTheme.tokens
    val name = format.weekdayDay(cell.day)
    val label = if (cell.isToday) stringResource(R.string.my_calendar_app_today_heading, name) else name
    val fill = when {
        !cell.isSelected -> Color.Transparent
        cell.isToday -> tokens.accentFill
        else -> tokens.bgInverse
    }
    val number = when {
        cell.isSelected -> if (cell.isToday) tokens.accentOn else tokens.textInverse
        cell.isToday -> tokens.accentText
        else -> tokens.textPrimary
    }
    Column(
        modifier.alpha(if (cell.isOutsideMonth) OUTSIDE_MONTH else 1f),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(Spacing.space1),
    ) {
        if (size == CellSize.Week) WeekdayLetter(cell.weekday, Modifier.fillMaxWidth())
        // The touch target is the whole cell, at least 48 dp tall; the circle is the look.
        Box(
            Modifier.fillMaxWidth().heightIn(min = NavSide)
                .clickable(role = Role.Button) { onSelect(cell.day) }
                // One element for TalkBack: the date, with today and the selected day said, not the bare number.
                .clearAndSetSemantics {
                    semanticsTestTag = AgendaTags.day(cell.day)
                    contentDescription = label
                    selected = cell.isSelected
                    role = Role.Button
                },
            contentAlignment = Alignment.Center,
        ) {
            Box(Modifier.size(size.circle).background(fill, CircleShape), contentAlignment = Alignment.Center) {
                Text(
                    cell.number.toString(),
                    color = number,
                    style = MaterialTheme.typography.body.numeric().copy(
                        fontWeight = if (cell.isSelected || cell.isToday) FontWeight.Bold else FontWeight.Medium,
                    ),
                )
            }
        }
        Dots(cell, size)
    }
}

private const val OUTSIDE_MONTH = 0.4f

/** One dot per session in its type's colour. The name is how many there are; the tag says which kinds, for a test. */
@Composable
private fun Dots(cell: AgendaDayCell, size: CellSize) {
    if (cell.count == 0) {
        Box(Modifier.height(DOTS_HEIGHT))
        return
    }
    val count = pluralStringResource(R.plurals.my_calendar_app_dots, cell.count, cell.count)
    val tokens = MaterialTheme.tokens
    Row(
        Modifier.height(DOTS_HEIGHT).testTag(AgendaTags.dots(cell.day, cell.dots)).semantics(mergeDescendants = true) {
            contentDescription = count
        },
        horizontalArrangement = Arrangement.spacedBy(3.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        cell.dots.forEach { kind ->
            Box(Modifier.size(size.dot).background(tokens.sessionColors(kind.sessionType).solid, CircleShape))
        }
    }
}

private val DOTS_HEIGHT = 8.dp

package app.fivvi.pro.personal

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.fivvi.core.R
import app.fivvi.core.kit.InsetGroupedList
import app.fivvi.core.kit.PillButton
import app.fivvi.core.kit.PillButtonStyle
import app.fivvi.core.kit.SegmentedChoice
import app.fivvi.core.kit.SegmentedOption
import app.fivvi.core.ui.placeholder
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.body
import app.fivvi.designtokens.headline
import app.fivvi.designtokens.subhead
import app.fivvi.designtokens.title1
import app.fivvi.pro.sessions.rememberSessionFormat
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/** Test tags, shared with the iOS accessibility identifiers and the Maestro flows (`calendar.*`). */
object AgendaTags {
    const val TITLE = "calendar.title"
    const val TITLE_BAR = "calendar.titleBar"
    const val TODAY = "calendar.today"
    const val MODE = "calendar.mode"
    const val MODE_DAY = "calendar.mode.day"
    const val MODE_WEEK = "calendar.mode.week"
    const val MODE_MONTH = "calendar.mode.month"
    const val WEEK_LINE = "calendar.weekLine"
    const val PREVIOUS = "calendar.previous"
    const val NEXT = "calendar.next"
    const val PREVIOUS_MONTH = "calendar.previousMonth"
    const val NEXT_MONTH = "calendar.nextMonth"
    const val MONTH_TITLE = "calendar.monthTitle"
    const val GRID = "calendar.grid"
    const val TIMELINE = "calendar.timeline"
    const val NOW = "calendar.now"
    const val CLOCK_NOTE = "calendar.clockNote"
    const val EMPTY = "calendar.empty"
    const val LOADING = "calendar.loading"
    const val FAILED = "calendar.failed"
    const val RETRY = "calendar.retry"
    const val OFFLINE = "calendar.offline"
    const val TIME_ZONE_HINT = "calendar.timeZoneHint"

    /** The prefix of the rows: `calendar.row.<session>`, as on iOS. */
    const val ROWS = "calendar"

    fun day(day: LocalDate) = "calendar.day.$day"

    /** The dots under a day: `calendar.dots.2026-09-22.private-private-group`. */
    fun dots(day: LocalDate, kinds: List<AgendaKind>) = "calendar.dots.$day.${kinds.joinToString("-") { it.tagName }}"

    fun block(id: java.util.UUID) = "calendar.block.$id"

    fun heading(day: LocalDate) = "calendar.heading.$day"

    fun emptyDay(day: LocalDate) = "calendar.empty.$day"
}

/** What TD-04 asks of its host: [menu] is the **+** with its entries, told whether the phone is offline (it is off then). */
class AgendaActions(
    val onRefresh: () -> Unit,
    val onShow: (AgendaMode) -> Unit,
    val onSelect: (LocalDate) -> Unit,
    val onStepWeek: (Int) -> Unit,
    val onStepMonth: (Int) -> Unit,
    val onToday: () -> Unit,
    val onOpen: (PersonalRow) -> Unit,
    val onRoute: (String) -> Unit,
    val menu: @Composable (offline: Boolean) -> Unit = {},
)

/**
 * TD-04 *Agenda* (F013, `DECISIONS.md` §3): the bar with *Vandaag* and **+**, the large title, *Dag | Week | Maand* under it.
 * *Dag* and *Week* share the strip of the week, a dot under each day for each session in its type's colour, with ‹ › by the
 * week line and a swipe for the other weeks; *Dag* is the selected day as a timeline, *Week* the seven days as lists. *Maand*
 * is the month grid with the selected day's list under it. The days on screen are read in one request, by pull and on the
 * foreground too, and a week the clocks change in says so. [deviceZone] is the phone's own time zone, which decides whether the
 * hint that times are Dutch shows; [now] ticks for the now-line.
 */
@Composable
fun AgendaScreen(
    state: AgendaState,
    actions: AgendaActions,
    deviceZone: ZoneId,
    now: Instant,
    modifier: Modifier = Modifier,
) {
    val format = rememberSessionFormat(PersonalRows.TIME_ZONE)
    val content = remember(state, now, format) { AgendaContent(state, now, format) }
    val list = rememberLazyListState()
    val collapsed by remember { derivedStateOf { list.firstVisibleItemIndex > 0 } }
    Column(modifier.fillMaxSize()) {
        AgendaBar(collapsed, actions, offline = state.isOffline)
        PullToRefreshBox(
            isRefreshing = state.refreshing,
            onRefresh = actions.onRefresh,
            modifier = Modifier.fillMaxSize(),
        ) {
            LazyColumn(
                state = list,
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = Spacing.space4, vertical = Spacing.space4),
                verticalArrangement = Arrangement.spacedBy(Spacing.space4),
            ) {
                item {
                    Text(
                        stringResource(R.string.my_calendar_app_title),
                        modifier = Modifier.testTag(AgendaTags.TITLE).semantics { heading() },
                        style = MaterialTheme.typography.title1,
                    )
                }
                item { Banners(state, actions, deviceZone, now) }
                item { ModeControl(state.mode, actions.onShow) }
                item {
                    when (state.mode) {
                        AgendaMode.Day, AgendaMode.Week -> WeekStrip(
                            content,
                            format,
                            actions.onSelect,
                            actions.onStepWeek,
                        )

                        AgendaMode.Month -> MonthGrid(content, format, actions.onSelect, actions.onStepMonth)
                    }
                }
                content.clockNotes.forEach { note -> item(key = "note-${note.day}") { ClockNote(note) } }
                when (state.load) {
                    AgendaLoad.Loading -> item { Skeleton() }
                    AgendaLoad.Failed -> item { Retry(actions.onRefresh, showsFailure = state.showsFailure) }
                    AgendaLoad.Loaded -> loaded(state, content, actions, now)
                }
            }
        }
    }
}

/** The bar: the small title once the large one is scrolled away, *Vandaag* and the **+** (as on Vandaag, off offline). */
@Composable
private fun AgendaBar(collapsed: Boolean, actions: AgendaActions, offline: Boolean) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = Spacing.space4).height(BAR_HEIGHT),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.weight(1f)) {
            if (collapsed) {
                Text(
                    stringResource(R.string.my_calendar_app_title),
                    modifier = Modifier.testTag(AgendaTags.TITLE_BAR).semantics { heading() },
                    style = MaterialTheme.typography.headline,
                )
            }
        }
        TextButton(onClick = actions.onToday, modifier = Modifier.testTag(AgendaTags.TODAY)) {
            Text(stringResource(R.string.my_calendar_today))
        }
        actions.menu(offline)
    }
}

private val BAR_HEIGHT = 56.dp

@Composable
private fun ModeControl(mode: AgendaMode, onShow: (AgendaMode) -> Unit) {
    val label = stringResource(R.string.my_calendar_views)
    SegmentedChoice(
        options = listOf(
            SegmentedOption(AgendaMode.Day, stringResource(R.string.my_calendar_view_day), AgendaTags.MODE_DAY),
            SegmentedOption(AgendaMode.Week, stringResource(R.string.my_calendar_view_week), AgendaTags.MODE_WEEK),
            SegmentedOption(
                AgendaMode.Month,
                stringResource(R.string.my_calendar_app_view_month),
                AgendaTags.MODE_MONTH,
            ),
        ),
        selected = mode,
        onSelect = onShow,
        modifier = Modifier.testTag(AgendaTags.MODE).semantics { contentDescription = label },
    )
}

/** The offline line, *Opnieuw* when an update failed, and the hint that times are Dutch. */
@Composable
private fun Banners(state: AgendaState, actions: AgendaActions, deviceZone: ZoneId, now: Instant) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.space2)) {
        if (state.isOffline) {
            val updatedAt = state.updatedAt
            val format = rememberSessionFormat(PersonalRows.TIME_ZONE)
            Text(
                text = if (updatedAt == null) {
                    stringResource(R.string.common_offline)
                } else {
                    stringResource(
                        R.string.my_day_app_offline,
                        format.time(updatedAt.atOffset(PersonalRows.TIME_ZONE.rules.getOffset(updatedAt))),
                    )
                },
                modifier = Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.secondaryContainer)
                    .padding(horizontal = Spacing.space4, vertical = Spacing.space2).testTag(AgendaTags.OFFLINE)
                    .semantics { liveRegion = LiveRegionMode.Polite },
                color = MaterialTheme.colorScheme.onSecondaryContainer,
                style = MaterialTheme.typography.body,
            )
        }
        if (state.updateFailed) Retry(actions.onRefresh, showsFailure = true)
        if (TodayContent.showsTimeZoneHint(deviceZone, now)) {
            Text(
                stringResource(R.string.personal_time_zone_hint),
                modifier = Modifier.testTag(AgendaTags.TIME_ZONE_HINT),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.subhead,
            )
        }
    }
}

/** *De agenda kon niet worden bijgewerkt.* with its one *Opnieuw*. */
@Composable
private fun Retry(onRetry: () -> Unit, showsFailure: Boolean) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.space3)) {
        if (showsFailure) {
            Text(
                stringResource(R.string.my_calendar_app_failed),
                modifier = Modifier.testTag(AgendaTags.FAILED),
                style = MaterialTheme.typography.body,
            )
        }
        PillButton(
            text = stringResource(R.string.my_day_app_retry),
            onClick = onRetry,
            modifier = Modifier.testTag(AgendaTags.RETRY),
            style = PillButtonStyle.Tonal,
        )
    }
}

@Composable
private fun Skeleton() {
    val label = stringResource(R.string.common_loading)
    Column(
        Modifier.fillMaxWidth().testTag(AgendaTags.LOADING).semantics { contentDescription = label },
        verticalArrangement = Arrangement.spacedBy(Spacing.space3),
    ) {
        repeat(SKELETON_ROWS) { Box(Modifier.fillMaxWidth().height(SKELETON_ROW_HEIGHT).placeholder()) }
    }
}

private const val SKELETON_ROWS = 3
private val SKELETON_ROW_HEIGHT = 64.dp

/** *zo 25 okt: wintertijd, de klok gaat 1 uur terug*, the day the clocks change. */
@Composable
private fun ClockNote(note: AgendaClockNote) {
    val id = if (note.change == AgendaCalendar.ClockChange.Back) {
        R.string.my_calendar_app_clock_back
    } else {
        R.string.my_calendar_app_clock_forward
    }
    Text(
        stringResource(id, note.dayText),
        modifier = Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.secondaryContainer)
            .padding(horizontal = Spacing.space4, vertical = Spacing.space2).testTag(AgendaTags.CLOCK_NOTE),
        color = MaterialTheme.colorScheme.onSecondaryContainer,
        style = MaterialTheme.typography.body,
    )
}

private fun LazyListScope.loaded(state: AgendaState, content: AgendaContent, actions: AgendaActions, now: Instant) {
    when (state.mode) {
        AgendaMode.Day -> item {
            val timeline = content.timeline()
            if (timeline != null) {
                DayTimeline(timeline, now, actions.onOpen)
            } else {
                EmptyDay(AgendaTags.EMPTY)
            }
        }

        AgendaMode.Week -> content.weekSections.forEach { section ->
            item(key = "day-${section.day}") { WeekDay(section, actions) }
        }

        AgendaMode.Month -> item {
            val rows = content.selectedRows
            if (rows.isEmpty()) {
                EmptyDay(AgendaTags.EMPTY)
            } else {
                InsetGroupedList {
                    rows.forEach { row -> row { AgendaRow(row, actions) } }
                }
            }
        }
    }
}

@Composable
private fun AgendaRow(row: PersonalRow, actions: AgendaActions) {
    PersonalRowItem(row, onOpen = { actions.onOpen(row) }, onRoute = actions.onRoute, tagPrefix = AgendaTags.ROWS)
}

/** A day of *Week*: its date as the heading, then its rows, or the line that it has none. */
@Composable
private fun WeekDay(section: AgendaWeekSection, actions: AgendaActions) {
    val format = rememberSessionFormat(PersonalRows.TIME_ZONE)
    val name = format.weekdayDay(section.day)
    val title = if (section.isToday) stringResource(R.string.my_calendar_app_today_heading, name) else name
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.space2)) {
        Text(
            title,
            modifier = Modifier.padding(start = Spacing.space4).testTag(AgendaTags.heading(section.day))
                .semantics { heading() },
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.subhead,
        )
        if (section.rows.isEmpty()) {
            EmptyDay(AgendaTags.emptyDay(section.day))
        } else {
            InsetGroupedList {
                section.rows.forEach { row -> row { AgendaRow(row, actions) } }
            }
        }
    }
}

/** *Geen sessies op deze dag.* */
@Composable
private fun EmptyDay(tag: String) {
    Text(
        stringResource(R.string.my_calendar_empty_day),
        modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.space4).testTag(tag),
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        style = MaterialTheme.typography.body,
    )
}

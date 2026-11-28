package app.fivvi.pro.personal

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.fivvi.core.R
import app.fivvi.core.kit.InsetGroupedList
import app.fivvi.core.kit.NextCard
import app.fivvi.core.kit.NextCardButton
import app.fivvi.core.kit.PillButton
import app.fivvi.core.kit.PillButtonStyle
import app.fivvi.core.kit.SessionType
import app.fivvi.core.ui.placeholder
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.body
import app.fivvi.designtokens.headline
import app.fivvi.designtokens.subhead
import app.fivvi.designtokens.title1
import app.fivvi.pro.attendance.AttendanceButtonHeight
import app.fivvi.pro.attendance.AttendanceNudges
import app.fivvi.pro.attendance.AttendanceStatus
import app.fivvi.pro.attendance.QueueState
import app.fivvi.pro.home.NewMenu
import app.fivvi.pro.sessions.rememberSessionFormat
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneId
import kotlinx.coroutines.delay

/** Test tags, shared with the iOS accessibility identifiers and the Maestro flows (`today.*`). */
object TodayTags {
    /** The prefix of the row tags: `today.row.<id>`. */
    const val PREFIX = "today"
    const val TITLE = "today.title"
    const val EYEBROW = "today.eyebrow"
    const val SUMMARY = "today.summary"
    const val TITLE_BAR = "today.titleBar"
    const val LOADING = "today.loading"
    const val FAILED = "today.failed"
    const val RETRY = "today.retry"
    const val OFFLINE = "today.offline"
    const val NOTICE = "today.notice"
    const val NOTICE_DISMISS = "today.notice.dismiss"

    /** The notice that attendance taps made before the account was known could not be sent (F025). */
    const val DROPPED_TAPS = "today.droppedTaps"
    const val DROPPED_TAPS_DISMISS = "today.droppedTaps.dismiss"
    const val TIME_ZONE_HINT = "today.timeZoneHint"
    const val CARD = "today.card"
    const val CARD_GAP = "today.card.gap"
    const val CARD_PLAN = "today.card.plan"
    const val CARD_NO_FREE_TIME = "today.card.noFreeTime"
    const val CARD_ROUTE = "today.card.route"

    /** *Te doen* (F025): its title, and a chip for each session still owing attendance, `today.card.todo.<id>`. */
    const val CARD_TODO = "today.card.todo"
    const val NEXT = "today.next"
    const val NEXT_OPEN = "today.next.open"
    const val EMPTY = "today.empty"
    const val TOMORROW = "today.tomorrow"

    fun row(id: java.util.UUID) = "today.row.$id"

    fun route(id: java.util.UUID) = "today.route.$id"

    fun todoChip(id: java.util.UUID) = "today.card.todo.$id"
}

/**
 * What TD-01 asks of its host. [onPlan] gets the start of the free gap (*Plannen*, PS-04 of F020) and is `null` where the
 * person may not plan sessions here; [menu] is the **+** with its entries, told whether the phone is offline (it is off then).
 */
class TodayActions(
    val onRefresh: () -> Unit,
    val onOpen: (PersonalRow) -> Unit,
    val onRoute: (String) -> Unit,
    val onPlan: ((OffsetDateTime) -> Unit)?,
    val onOpenTomorrow: (String) -> Unit,
    val onDismissNotices: () -> Unit,
    val menu: @Composable (offline: Boolean) -> Unit = {},
    /** *Aanwezig* or *Niet verschenen* of a nudge: queued, so the nudge goes at once (F025). */
    val onMark: (PersonalRow, AttendanceStatus) -> Unit = { _, _ -> },
    /** The line *Aanwezigheid nog invullen* of an ended class opens CO-05 (F025). */
    val onOpenAttendance: (PersonalRow) -> Unit = {},
    /** The notice that taps from before the account was known could not be sent was read (F025). */
    val onDismissDroppedTaps: () -> Unit = {},
)

/**
 * TD-01 *Vandaag* (F013): the large title with the date above it and the summary under it, no rings; the *Mijn dag* card; the
 * next item as the gradient card; every other item in time order; the *Morgen* line. Loading is skeleton rows; the day
 * refreshes by pull. The title collapses into a small bar once it is scrolled away. [deviceZone] is the phone's own
 * time zone, which decides whether the hint that times are Dutch shows; [now] ticks for the countdown on the next card.
 * An Owner of a workspace with a team has *Mijn dag | Hele studio* under the title ([studio], F014): the same screen with
 * the workspace's day, a lane per trainer, in place of the personal one.
 */
@Composable
fun TodayScreen(
    state: TodayState,
    actions: TodayActions,
    deviceZone: ZoneId,
    now: Instant,
    modifier: Modifier = Modifier,
    studio: StudioUi? = null,
    /** What the offline queue of attendance holds and has answered (F025): the nudges and the chips of *Te doen* follow it. */
    queue: QueueState = QueueState(),
) {
    val format = rememberSessionFormat(PersonalRows.TIME_ZONE)
    val content = remember(state.day, state.now, format, queue) {
        state.day?.let { TodayContent(it, state.now, format, AttendanceNudges(queue)) }
    }
    val studioDay = studio?.state?.takeIf { it.isStudio }?.day
    val studioContent = remember(studioDay, studio?.workspace, now, format.locale, queue) {
        val workspace = studio?.workspace
        if (studioDay != null && workspace != null) {
            StudioContent(studioDay, workspace.id, workspace.name, workspace.ownId, now, format.locale, queue)
        } else {
            null
        }
    }
    val showsToggle = studio?.state?.showsToggle == true
    val isStudio = studio?.state?.isStudio == true
    val list = rememberLazyListState()
    val collapsed by remember { derivedStateOf { list.firstVisibleItemIndex > 0 } }
    val title = stringResource(R.string.my_day_app_title)
    PullToRefreshBox(
        isRefreshing = state.refreshing,
        onRefresh = actions.onRefresh,
        modifier = modifier.fillMaxSize(),
    ) {
        LazyColumn(
            state = list,
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(horizontal = Spacing.space4, vertical = Spacing.space4),
            verticalArrangement = Arrangement.spacedBy(Spacing.space4),
        ) {
            item {
                Header(
                    title,
                    TodayContent.eyebrow(state.now, format.locale),
                    content,
                    showsSummary = state.day != null && !showsToggle,
                    actions.menu,
                    state.isOffline,
                )
            }
            // The personal day's own states belong to Mijn dag: the studio shows its own.
            item { Banners(state, actions, deviceZone, now, queue.droppedTaps, personal = !isStudio) }
            if (studio != null && showsToggle) {
                item { StudioScopeControl(studio, summary = if (state.day != null) summaryText(content) else null) }
            }
            if (studio != null && isStudio) {
                studioDay(studio, studioContent, actions, now)
            } else {
                when (state.load) {
                    TodayLoad.Loading -> item { Skeleton() }
                    TodayLoad.Failed -> item { Retry(actions.onRefresh, showsFailure = state.showsFailure) }
                    TodayLoad.Loaded -> if (content != null) loaded(content, state, actions, now)
                }
            }
        }
        if (collapsed) CollapsedBar(title, Modifier.align(Alignment.TopCenter))
    }
}

@Composable
private fun Header(
    title: String,
    eyebrow: String,
    content: TodayContent?,
    showsSummary: Boolean,
    menu: @Composable (offline: Boolean) -> Unit,
    offline: Boolean,
) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(Spacing.space1)) {
            Text(
                eyebrow,
                modifier = Modifier.testTag(TodayTags.EYEBROW),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.subhead,
            )
            Text(
                title,
                modifier = Modifier.testTag(TodayTags.TITLE).semantics {
                    heading()
                },
                style = MaterialTheme.typography.title1,
            )
            if (showsSummary) {
                Text(
                    text = summaryText(content),
                    modifier = Modifier.testTag(TodayTags.SUMMARY),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.body,
                )
            }
        }
        menu(offline)
    }
}

/** *4 sessies · 09:00–19:00 · 1 klaar*, or *Geen sessies vandaag*. */
@Composable
private fun summaryText(content: TodayContent?): String {
    val summary = content?.summary
    return if (summary == null) {
        stringResource(R.string.my_day_app_summary_empty)
    } else {
        pluralStringResource(
            R.plurals.my_day_app_summary,
            summary.count,
            summary.count,
            summary.done.toString(),
            summary.first,
            summary.last,
        )
    }
}

/** The small title bar the large title turns into once it is scrolled away. */
@Composable
private fun CollapsedBar(title: String, modifier: Modifier) {
    Surface(modifier.fillMaxWidth().testTag(TodayTags.TITLE_BAR), color = MaterialTheme.colorScheme.surfaceContainer) {
        Text(
            title,
            modifier = Modifier.padding(horizontal = Spacing.space4, vertical = Spacing.space3).semantics { heading() },
            style = MaterialTheme.typography.headline,
        )
    }
}

@Composable
private fun Banners(
    state: TodayState,
    actions: TodayActions,
    deviceZone: ZoneId,
    now: Instant,
    droppedTaps: Int,
    personal: Boolean = true,
) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.space2)) {
        // Of the app, not of the day: it shows in *Hele studio* too. Once, until it is dismissed.
        if (droppedTaps > 0) {
            Row(
                Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.secondaryContainer),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    pluralStringResource(R.plurals.attendance_app_dropped_taps, droppedTaps, droppedTaps),
                    modifier = Modifier.weight(1f).padding(horizontal = Spacing.space4, vertical = Spacing.space2)
                        .testTag(TodayTags.DROPPED_TAPS).semantics { liveRegion = LiveRegionMode.Polite },
                    color = MaterialTheme.colorScheme.onSecondaryContainer,
                    style = MaterialTheme.typography.body,
                )
                TextButton(
                    onClick = actions.onDismissDroppedTaps,
                    modifier = Modifier.testTag(TodayTags.DROPPED_TAPS_DISMISS),
                ) {
                    Text(stringResource(R.string.my_day_app_dismiss))
                }
            }
        }
        state.notices.forEach { name ->
            Row(
                Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.secondaryContainer),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    stringResource(R.string.my_day_app_removed, name),
                    modifier = Modifier.weight(1f).padding(horizontal = Spacing.space4, vertical = Spacing.space2)
                        .testTag(TodayTags.NOTICE).semantics { liveRegion = LiveRegionMode.Polite },
                    color = MaterialTheme.colorScheme.onSecondaryContainer,
                    style = MaterialTheme.typography.body,
                )
                TextButton(onClick = actions.onDismissNotices, modifier = Modifier.testTag(TodayTags.NOTICE_DISMISS)) {
                    Text(stringResource(R.string.my_day_app_dismiss))
                }
            }
        }
        if (personal && state.isOffline) {
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
                    .padding(horizontal = Spacing.space4, vertical = Spacing.space2).testTag(TodayTags.OFFLINE)
                    .semantics { liveRegion = LiveRegionMode.Polite },
                color = MaterialTheme.colorScheme.onSecondaryContainer,
                style = MaterialTheme.typography.body,
            )
        }
        if (personal && state.updateFailed) Retry(actions.onRefresh, showsFailure = true)
        if (TodayContent.showsTimeZoneHint(deviceZone, now)) {
            Text(
                stringResource(R.string.personal_time_zone_hint),
                modifier = Modifier.testTag(TodayTags.TIME_ZONE_HINT),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.subhead,
            )
        }
    }
}

/** *Vandaag kon niet worden bijgewerkt.* with its one *Opnieuw*. */
@Composable
private fun Retry(onRetry: () -> Unit, showsFailure: Boolean) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.space3)) {
        if (showsFailure) {
            Text(
                stringResource(R.string.my_day_app_failed),
                modifier = Modifier.testTag(TodayTags.FAILED),
                style = MaterialTheme.typography.body,
            )
        }
        PillButton(
            text = stringResource(R.string.my_day_app_retry),
            onClick = onRetry,
            modifier = Modifier.testTag(TodayTags.RETRY),
            style = PillButtonStyle.Tonal,
        )
    }
}

@Composable
private fun Skeleton() {
    val label = stringResource(R.string.common_loading)
    Column(
        Modifier.fillMaxWidth().testTag(TodayTags.LOADING).semantics { contentDescription = label },
        verticalArrangement = Arrangement.spacedBy(Spacing.space3),
    ) {
        repeat(SKELETON_ROWS) { Box(Modifier.fillMaxWidth().height(SKELETON_ROW_HEIGHT).placeholder()) }
    }
}

private const val SKELETON_ROWS = 3
private val SKELETON_ROW_HEIGHT = 64.dp

private fun androidx.compose.foundation.lazy.LazyListScope.loaded(
    content: TodayContent,
    state: TodayState,
    actions: TodayActions,
    now: Instant,
) {
    content.card?.let { card -> item { MijnDagCard(card, state, actions) } }
    content.next?.let { next -> item { NextUp(next, now, actions) } }
    if (content.rows.isNotEmpty()) {
        item {
            InsetGroupedList {
                content.rows.forEach { row ->
                    row {
                        PersonalRowItem(
                            row,
                            onOpen = { actions.onOpen(row) },
                            onRoute = actions.onRoute,
                            onMark = { actions.onMark(row, it) },
                            onOpenAttendance = { actions.onOpenAttendance(row) },
                        )
                    }
                }
            }
        }
    }
    content.empty?.let { empty -> item { EmptyText(empty) } }
    content.tomorrow?.let { tomorrow -> item { TomorrowLine(tomorrow, actions) } }
}

/** The card under the header: only what the list doesn't tell (`DECISIONS.md` §3). */
@Composable
private fun MijnDagCard(card: PersonalCard, state: TodayState, actions: TodayActions) {
    Column(Modifier.testTag(TodayTags.CARD), verticalArrangement = Arrangement.spacedBy(Spacing.space2)) {
        Text(
            stringResource(R.string.my_day_title),
            modifier = Modifier.padding(start = Spacing.space4).semantics { heading() },
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.subhead,
        )
        InsetGroupedList {
            row { Todo(card.todo, actions) }
            val gap = card.gap
            if (gap != null) {
                row {
                    Row(
                        Modifier.fillMaxWidth().padding(horizontal = Spacing.space4, vertical = Spacing.space3),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(
                                stringResource(R.string.my_day_app_free_gap, gap.from, gap.to),
                                modifier = Modifier.testTag(TodayTags.CARD_GAP),
                                style = MaterialTheme.typography.headline,
                            )
                            Text(
                                stringResource(R.string.my_day_app_free_gap_length, gap.hours),
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                style = MaterialTheme.typography.subhead,
                            )
                        }
                        // Planning needs the server: where the person may not plan, or the phone is offline, it is off,
                        // and offline says why.
                        val offlineReason = stringResource(R.string.common_offline)
                        PillButton(
                            text = stringResource(R.string.my_day_app_plan),
                            onClick = { actions.onPlan?.invoke(gap.start) },
                            modifier = Modifier.testTag(TodayTags.CARD_PLAN).semantics {
                                if (state.isOffline) stateDescription = offlineReason
                            },
                            style = PillButtonStyle.Tonal,
                            enabled = actions.onPlan != null && !state.isOffline,
                        )
                    }
                }
            } else {
                row {
                    Text(
                        stringResource(R.string.my_day_app_no_free_time),
                        modifier = Modifier.fillMaxWidth().padding(Spacing.space4).testTag(TodayTags.CARD_NO_FREE_TIME),
                        style = MaterialTheme.typography.body,
                    )
                }
            }
            card.route?.let { route ->
                row {
                    Column(
                        Modifier.fillMaxWidth().padding(horizontal = Spacing.space4, vertical = Spacing.space3)
                            .testTag(TodayTags.CARD_ROUTE).semantics(mergeDescendants = true) {},
                    ) {
                        Text(stringResource(R.string.my_day_app_route), style = MaterialTheme.typography.headline)
                        Text(
                            route,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            style = MaterialTheme.typography.subhead,
                        )
                    }
                }
            }
        }
    }
}

/**
 * The card's first row (F025): *Te doen* with a chip *Aanwezigheid · Anna 09:00* for each ended item whose attendance is still
 * open, which opens TD-02 or TD-03; with nothing open it reads *Alles bijgewerkt*. The chips wrap onto more lines at large font
 * sizes, and each is at least 48 dp high.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Todo(todo: PersonalTodo, actions: TodayActions) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = Spacing.space4, vertical = Spacing.space3),
        horizontalArrangement = Arrangement.spacedBy(Spacing.space3),
    ) {
        Icon(
            painterResource(R.drawable.ic_check),
            contentDescription = null,
            modifier = Modifier.size(Spacing.space6),
            tint = MaterialTheme.colorScheme.primary,
        )
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(Spacing.space2)) {
            Text(
                stringResource(
                    if (todo.chips.isEmpty()) R.string.attendance_app_caught_up else R.string.attendance_app_todo,
                ),
                modifier = Modifier.testTag(TodayTags.CARD_TODO),
                style = MaterialTheme.typography.headline,
            )
            if (todo.chips.isNotEmpty()) {
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(Spacing.space2),
                    verticalArrangement = Arrangement.spacedBy(Spacing.space2),
                ) {
                    todo.chips.forEach { chip ->
                        val text = stringResource(R.string.attendance_app_chip, chip.who, chip.row.startText)
                        Surface(
                            onClick = { actions.onOpen(chip.row) },
                            modifier = Modifier.defaultMinSize(minHeight = AttendanceButtonHeight)
                                .testTag(TodayTags.todoChip(chip.row.id)),
                            shape = CircleShape,
                            color = MaterialTheme.colorScheme.secondaryContainer,
                            contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
                        ) {
                            Box(
                                Modifier.padding(horizontal = Spacing.space4, vertical = Spacing.space2),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(
                                    text,
                                    style = MaterialTheme.typography.subhead.copy(fontWeight = FontWeight.SemiBold),
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun NextUp(next: PersonalNext, now: Instant, actions: TodayActions) {
    val row = next.row
    val minutes = next.minutesAt(now)
    val times = stringResource(R.string.my_day_time_range, row.endText, row.startText)
    val subtitle = listOfNotNull(
        times,
        kindLabel(row).takeIf { row.namesKind },
        row.location,
        row.workspaceName.takeIf { row.showsWorkspace },
    ).joinToString(" · ")
    val caption = if (minutes == null) {
        stringResource(R.string.my_day_next_in_progress)
    } else {
        stringResource(R.string.my_day_next_upcoming, minutes.toString())
    }
    NextCard(
        type = if (row.isGroup) SessionType.Group else SessionType.Private,
        caption = caption,
        title = row.title,
        modifier = Modifier.testTag(TodayTags.NEXT),
        subtitle = subtitle,
        // F024: *Je valt in voor Sarah* under the card's subtitle, and part of its one name for TalkBack.
        detail = substitutionText(row),
        description = stringResource(R.string.my_day_spoken_join, caption, spokenLabel(row)),
    ) {
        NextCardButton(
            text = stringResource(R.string.my_day_app_open),
            onClick = { actions.onOpen(row) },
            modifier = Modifier.testTag(TodayTags.NEXT_OPEN),
        )
    }
}

@Composable
private fun EmptyText(empty: PersonalEmpty) {
    Text(
        text = when (empty) {
            is PersonalEmpty.NextSession -> stringResource(R.string.my_day_empty_next, empty.date)
            PersonalEmpty.Today -> stringResource(R.string.my_day_empty_today)
            PersonalEmpty.Never -> stringResource(R.string.my_day_empty_never)
        },
        modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.space4).testTag(TodayTags.EMPTY),
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        style = MaterialTheme.typography.body,
    )
}

/** *Morgen: 3 sessies, eerste om 07:00*, which opens Agenda on that day. */
@Composable
private fun TomorrowLine(tomorrow: PersonalTomorrow, actions: TodayActions) {
    val hint = stringResource(R.string.my_day_app_tomorrow_hint)
    val text = pluralStringResource(R.plurals.my_day_tomorrow, tomorrow.count, tomorrow.count, tomorrow.first)
    InsetGroupedList {
        row {
            Row(
                Modifier.fillMaxWidth().clickable(onClickLabel = hint) { actions.onOpenTomorrow(tomorrow.date) }
                    .padding(horizontal = Spacing.space4, vertical = Spacing.space4).testTag(TodayTags.TOMORROW),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(text, modifier = Modifier.weight(1f), style = MaterialTheme.typography.headline)
                androidx.compose.material3.Icon(
                    androidx.compose.ui.res.painterResource(R.drawable.ic_chevron_right),
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

/** Ticks while Vandaag is on screen, so the countdown on the next card follows the clock (every 30 s, as on iOS). */
@Composable
fun rememberTicking(clock: () -> Instant): Instant {
    var now by remember { mutableStateOf(clock()) }
    val current by rememberUpdatedState(clock)
    LaunchedEffect(Unit) {
        while (true) {
            delay(TICK_MILLIS)
            now = current()
        }
    }
    return now
}

private const val TICK_MILLIS = 30_000L

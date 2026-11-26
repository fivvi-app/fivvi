package app.fivvi.pro.personal

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag as semanticsTestTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.fivvi.api.models.TrainerWord
import app.fivvi.core.R
import app.fivvi.core.TrainerWordForms
import app.fivvi.core.kit.FivviCard
import app.fivvi.core.kit.InsetGroupedList
import app.fivvi.core.kit.NextCard
import app.fivvi.core.kit.NextCardButton
import app.fivvi.core.kit.PersonAvatar
import app.fivvi.core.kit.PillButton
import app.fivvi.core.kit.PillButtonStyle
import app.fivvi.core.kit.SegmentedChoice
import app.fivvi.core.kit.SegmentedOption
import app.fivvi.core.kit.SessionType
import app.fivvi.core.kit.sessionColors
import app.fivvi.core.theme.tokens
import app.fivvi.core.trainerWordForms
import app.fivvi.core.ui.placeholder
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.body
import app.fivvi.designtokens.caption
import app.fivvi.designtokens.footnote
import app.fivvi.designtokens.headline
import app.fivvi.designtokens.subhead
import java.time.Instant
import java.util.UUID

/** Test tags of the Owner's *Hele studio*, shared with the iOS accessibility identifiers (`today.scope`, `today.studio.*`). */
object StudioTags {
    const val SCOPE = "today.scope"
    const val SCOPE_MINE = "today.scope.mine"
    const val SCOPE_STUDIO = "today.scope.studio"
    const val SCOPE_LINE = "today.scope.line"
    const val CARD = "today.studio.card"
    const val HEAD = "today.studio.head"
    const val BUSIEST = "today.studio.busiest"
    const val NOW = "today.studio.now"
    const val NEXT = "today.studio.next"
    const val NEXT_OPEN = "today.studio.next.open"
    const val LOADING = "today.studio.loading"
    const val FAILED = "today.studio.failed"
    const val RETRY = "today.studio.retry"

    fun lane(id: String) = "today.studio.lane.$id"

    fun block(id: UUID) = "today.studio.block.$id"
}

/** The workspace *Hele studio* is of: its name, the signed-in person's place on its team and its word for the trainers. */
data class StudioWorkspace(val id: UUID, val name: String, val ownId: UUID, val trainerWord: TrainerWord)

/** What TD-01 asks of *Mijn dag | Hele studio*: its state and the choice of a side. */
class StudioUi(val state: StudioState, val workspace: StudioWorkspace, val onSelect: (StudioScope) -> Unit)

/** The segmented control under the title and the line under it: Mijn dag's summary, or what the studio is. */
@Composable
fun StudioScopeControl(studio: StudioUi, summary: String?, modifier: Modifier = Modifier) {
    val label = stringResource(R.string.my_day_app_scope_label)
    val forms = trainerWordForms(studio.workspace.trainerWord)
    Column(modifier, verticalArrangement = Arrangement.spacedBy(Spacing.space3)) {
        SegmentedChoice(
            options = listOf(
                SegmentedOption(
                    StudioScope.Mine,
                    stringResource(R.string.my_day_app_scope_mine),
                    StudioTags.SCOPE_MINE,
                ),
                SegmentedOption(
                    StudioScope.Studio,
                    stringResource(R.string.my_day_app_scope_studio),
                    StudioTags.SCOPE_STUDIO,
                ),
            ),
            selected = studio.state.scope,
            onSelect = studio.onSelect,
            modifier = Modifier.testTag(StudioTags.SCOPE).semantics { contentDescription = label },
        )
        val line = if (studio.state.isStudio) {
            stringResource(R.string.my_day_app_studio_line, forms.words, studio.workspace.name)
        } else {
            summary
        }
        if (line != null) {
            Text(
                line,
                modifier = Modifier.testTag(StudioTags.SCOPE_LINE),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.subhead,
            )
        }
    }
}

/** What *Hele studio* has under the control: the team card, the next card and the day's rows, read-only. */
internal fun LazyListScope.studioDay(studio: StudioUi, content: StudioContent?, actions: TodayActions, now: Instant) {
    val state = studio.state
    val trainerWord = studio.workspace.trainerWord
    when (state.load) {
        TodayLoad.Loading -> item { StudioSkeleton() }

        TodayLoad.Failed -> item { StudioRetry(state, actions.onRefresh) }

        TodayLoad.Loaded -> if (content != null) {
            if (state.isOffline || state.updateFailed) item { StudioRetry(state, actions.onRefresh) }
            item { StudioTeamCard(content.team, trainerWord, actions.onOpen) }
            content.next?.let { next -> item { StudioNext(next, now, trainerWord, actions.onOpen) } }
            if (content.rows.isNotEmpty()) {
                item {
                    val nobody =
                        stringResource(R.string.my_day_app_studio_no_trainer, trainerWordForms(trainerWord).word)
                    InsetGroupedList {
                        content.rows.forEach { row ->
                            row {
                                PersonalRowItem(
                                    row,
                                    onOpen = { actions.onOpen(row) },
                                    onRoute = actions.onRoute,
                                    nobody = nobody,
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
private fun StudioSkeleton() {
    val label = stringResource(R.string.common_loading)
    Column(
        Modifier.fillMaxWidth().testTag(StudioTags.LOADING).semantics { contentDescription = label },
        verticalArrangement = Arrangement.spacedBy(Spacing.space3),
    ) {
        repeat(SKELETON_ROWS) {
            Box(Modifier.fillMaxWidth().height(SKELETON_ROW_HEIGHT).placeholder())
        }
    }
}

/** *Je bent offline.* or *Vandaag kon niet worden bijgewerkt.*, with its one *Opnieuw*. */
@Composable
private fun StudioRetry(state: StudioState, onRetry: () -> Unit) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.space3)) {
        val text = when {
            state.isOffline -> stringResource(R.string.common_offline)
            state.showsFailure -> stringResource(R.string.my_day_app_failed)
            else -> null
        }
        if (text != null) {
            Text(text, modifier = Modifier.testTag(StudioTags.FAILED), style = MaterialTheme.typography.body)
        }
        PillButton(
            text = stringResource(R.string.my_day_app_retry),
            onClick = onRetry,
            modifier = Modifier.testTag(StudioTags.RETRY),
            style = PillButtonStyle.Tonal,
        )
    }
}

/** The card of the prototype's *Hele studio*: its head, the lanes and the axis under them. */
@Composable
private fun StudioTeamCard(team: StudioTeam, trainerWord: TrainerWord, onOpen: (PersonalRow) -> Unit) {
    val forms = trainerWordForms(trainerWord)
    FivviCard(Modifier.fillMaxWidth().testTag(StudioTags.CARD)) {
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.space3)) {
            StudioHead(team, forms)
            team.timeline?.let { Lanes(it, forms, onOpen) }
        }
    }
}

@Composable
private fun StudioHead(team: StudioTeam, forms: TrainerWordForms) {
    val head = when (team.trainers) {
        0 -> stringResource(R.string.my_day_app_summary_empty)
        1 -> stringResource(R.string.my_day_app_studio_trainers_one, team.trainers.toString(), forms.word)
        else -> stringResource(R.string.my_day_app_studio_trainers_many, team.trainers.toString(), forms.words)
    }
    val busiest = team.busiest?.let {
        stringResource(R.string.my_day_app_studio_busiest, it.count.toString(), it.from, it.to)
    } ?: if (team.timeline != null) stringResource(R.string.my_day_app_studio_no_overlap) else null
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Spacing.space2)) {
        Text(
            head,
            modifier = Modifier.weight(1f, fill = false).testTag(StudioTags.HEAD),
            style = MaterialTheme.typography.headline,
        )
        if (busiest != null) {
            Text(
                busiest,
                modifier = Modifier.weight(1f).testTag(StudioTags.BUSIEST),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.subhead,
                textAlign = TextAlign.End,
            )
        }
    }
}

@Composable
private fun Lanes(timeline: StudioTimeline, forms: TrainerWordForms, onOpen: (PersonalRow) -> Unit) {
    // At the larger font scales the label is wider and wraps instead of being cut off.
    val labelWidth = if (LocalDensity.current.fontScale > LARGE_FONT_SCALE) WIDE_LABEL else LABEL
    val nobody = stringResource(R.string.my_day_app_studio_no_trainer, forms.word)
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.space2)) {
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            Column(Modifier.fillMaxWidth()) {
                timeline.lanes.forEach { lane ->
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(Spacing.space2),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        LaneLabel(lane, nobody, Modifier.width(labelWidth))
                        LaneTrack(lane, nobody, onOpen, Modifier.weight(1f))
                    }
                }
            }
            timeline.nowFraction?.let { fraction ->
                val track = maxWidth - labelWidth - Spacing.space2
                // The now-line runs across every lane's track; it is no control and says nothing to TalkBack.
                Box(Modifier.matchParentSize()) {
                    Box(
                        Modifier.offset(x = labelWidth + Spacing.space2 + track * fraction.toFloat())
                            .width(NOW_LINE_WIDTH).fillMaxHeight().testTag(StudioTags.NOW)
                            .background(MaterialTheme.colorScheme.primary),
                    )
                }
            }
        }
        Axis(timeline, labelWidth)
    }
}

@Composable
private fun LaneLabel(lane: StudioLane, nobody: String, modifier: Modifier) {
    val title = when {
        lane.isOwn -> stringResource(R.string.my_day_app_studio_you)
        else -> lane.firstName ?: nobody
    }
    Row(
        modifier,
        horizontalArrangement = Arrangement.spacedBy(Spacing.space1),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val name = lane.trainerName
        if (name != null) {
            PersonAvatar(name, size = AVATAR)
        } else {
            Box(Modifier.size(AVATAR).background(MaterialTheme.colorScheme.surfaceVariant, CircleShape))
        }
        Text(
            title,
            modifier = Modifier.testTag(StudioTags.lane(lane.id)),
            style = MaterialTheme.typography.footnote.copy(fontWeight = FontWeight.SemiBold),
        )
    }
}

/**
 * A lane: its blocks drawn 24 dp tall (14 dp where sessions of the trainer overlap, as in the prototype) in a track at least
 * 48 dp tall (size.touch-min). The track is shared out among the lane's rows, so each block is touched on its whole row of the track, and
 * blocks of one lane never take each other's touches.
 */
@Composable
private fun LaneTrack(lane: StudioLane, nobody: String, onOpen: (PersonalRow) -> Unit, modifier: Modifier) {
    val blockHeight = if (lane.rowCount > 1) STACKED_BLOCK else BLOCK
    val height = maxOf(TOUCH, (blockHeight + 1.dp) * lane.rowCount - 1.dp)
    val band = height / lane.rowCount
    BoxWithConstraints(modifier.fillMaxWidth().height(height)) {
        Box(
            Modifier.align(Alignment.Center).fillMaxWidth().height(1.dp)
                .background(MaterialTheme.colorScheme.outlineVariant),
        )
        lane.blocks.forEach { block ->
            val name = stringResource(
                R.string.my_day_app_studio_block,
                block.row.startText,
                block.row.title,
                block.trainerName ?: nobody,
            )
            val colors = MaterialTheme.tokens.sessionColors(
                if (block.isGroup) SessionType.Group else SessionType.Private,
            )
            Box(
                Modifier.offset(x = maxWidth * block.left.toFloat(), y = band * block.stack)
                    .size(maxOf(MIN_BLOCK_WIDTH, maxWidth * block.width.toFloat() - BLOCK_GAP), band)
                    .clickable { onOpen(block.row) }
                    .clearAndSetSemantics {
                        semanticsTestTag = StudioTags.block(block.row.id)
                        contentDescription = name
                        role = Role.Button
                    },
                contentAlignment = Alignment.Center,
            ) {
                Box(
                    Modifier.fillMaxWidth().height(blockHeight).alpha(if (block.isPast) PAST else 1f)
                        .background(colors.solid, RoundedCornerShape(BLOCK_RADIUS)),
                )
            }
        }
    }
}

/** The hours under the lanes, every three. Decorative: the blocks name their own start. */
@Composable
private fun Axis(timeline: StudioTimeline, labelWidth: Dp) {
    Row(Modifier.fillMaxWidth().height(AXIS_HEIGHT).clearAndSetSemantics { }) {
        Spacer(Modifier.width(labelWidth + Spacing.space2))
        BoxWithConstraints(Modifier.weight(1f).fillMaxHeight()) {
            timeline.ticks.forEach { tick ->
                Text(
                    tick.label,
                    modifier = Modifier.offset(x = maxWidth * tick.fraction.toFloat() - TICK_HALF_WIDTH),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.caption,
                    maxLines = 1,
                    softWrap = false,
                )
            }
        }
    }
}

/** The next card of *Hele studio*: the first session that has not ended, with its trainer under it. */
@Composable
private fun StudioNext(next: PersonalNext, now: Instant, trainerWord: TrainerWord, onOpen: (PersonalRow) -> Unit) {
    val forms = trainerWordForms(trainerWord)
    val row = next.row
    val minutes = next.minutesAt(now)
    val times = stringResource(R.string.my_day_time_range, row.endText, row.startText)
    val name = when (val trainer = row.trainer) {
        PersonalTrainer.You -> stringResource(R.string.my_day_app_studio_you_lower)
        is PersonalTrainer.Named -> trainer.name
        else -> null
    }
    val trainerLine = if (name != null) {
        stringResource(R.string.my_day_app_studio_trainer, forms.wordCap, name)
    } else {
        stringResource(R.string.my_day_app_studio_no_trainer, forms.word)
    }
    val subtitle = listOfNotNull(times, kindLabel(row).takeIf { row.namesKind }, row.location).joinToString(" · ")
    NextCard(
        type = if (row.isGroup) SessionType.Group else SessionType.Private,
        caption = if (minutes == null) {
            stringResource(R.string.my_day_next_in_progress)
        } else {
            stringResource(R.string.my_day_next_upcoming, minutes.toString())
        },
        title = row.title,
        modifier = Modifier.testTag(StudioTags.NEXT),
        subtitle = "$subtitle\n$trainerLine",
    ) {
        NextCardButton(
            text = stringResource(R.string.my_day_app_open),
            onClick = { onOpen(row) },
            modifier = Modifier.testTag(StudioTags.NEXT_OPEN),
        )
    }
}

private const val SKELETON_ROWS = 3
private val SKELETON_ROW_HEIGHT = 64.dp
private const val LARGE_FONT_SCALE = 1.3f
private val LABEL = 80.dp
private val WIDE_LABEL = 150.dp
private val AVATAR = 24.dp
private val BLOCK = 24.dp
private val STACKED_BLOCK = 14.dp

/** What a block may be touched on: at least 48 dp tall (size.touch-min on Android), whatever it is drawn as. */
private val TOUCH = 48.dp
private val MIN_BLOCK_WIDTH = 6.dp
private val BLOCK_GAP = 2.dp
private val BLOCK_RADIUS = 4.dp
private val NOW_LINE_WIDTH = 2.dp
private val AXIS_HEIGHT = 16.dp
private val TICK_HALF_WIDTH = 8.dp
private const val PAST = 0.4f

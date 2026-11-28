package app.fivvi.pro.personal

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag as semanticsTestTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.fivvi.core.R
import app.fivvi.core.kit.SessionType
import app.fivvi.core.kit.sessionColors
import app.fivvi.core.theme.numeric
import app.fivvi.core.theme.tokens
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.caption
import app.fivvi.designtokens.footnote
import java.time.Instant

private val LabelWidth = 52.dp
private val Inset = 10.dp
private val Gutter = 3.dp
private const val DIMMED = 0.55f

private fun offsetOf(minutes: Int): Dp = Inset + (minutes / 60f * AgendaTimeline.HOUR_HEIGHT).dp

/**
 * *Dag* on Agenda (TD-04): the selected day as a timeline, an hour a row, each session a block in its type's colour with its
 * name and its start, sessions drawn over each other side by side, a cancelled one marked *Geannuleerd*, and the now-line on
 * today. A block opens TD-02 or TD-03 of the session. A block under 48 dp is touched on 48 dp where there is room, above and
 * below it, never over a block beside it ([AgendaTimeline.metrics]).
 */
@Composable
fun DayTimeline(timeline: AgendaTimeline, now: Instant, onOpen: (PersonalRow) -> Unit) {
    val tokens = MaterialTheme.tokens
    val format = app.fivvi.pro.sessions.rememberSessionFormat(PersonalRows.TIME_ZONE)
    val height = offsetOf(timeline.totalMinutes + timeline.overflowMinutes) + Inset
    BoxWithConstraints(
        Modifier.fillMaxWidth().height(height).background(tokens.bgSurface, RoundedCornerShape(GROUP_RADIUS))
            .padding(horizontal = Spacing.space3).testTag(AgendaTags.TIMELINE),
    ) {
        val width = maxWidth - LabelWidth
        HourLines(timeline)
        timeline.blocks.forEach { block -> Block(timeline, block, width, onOpen) }
        timeline.nowMinutes?.let { minutes ->
            val time = format.time(now.atOffset(PersonalRows.TIME_ZONE.rules.getOffset(now)))
            NowLine(minutes, width, stringResource(R.string.my_calendar_app_now, time))
        }
    }
}

private val GROUP_RADIUS = 20.dp

@Composable
private fun HourLines(timeline: AgendaTimeline) {
    timeline.hours.forEachIndexed { index, hour ->
        Row(
            Modifier.fillMaxWidth().offset(y = offsetOf(index * 60) - HOUR_LABEL_RAISE).clearAndSetSemantics { },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.space2),
        ) {
            Text(
                hour,
                modifier = Modifier.width(LabelWidth - Spacing.space2),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.caption.numeric(),
                textAlign = androidx.compose.ui.text.style.TextAlign.End,
            )
            Box(Modifier.weight(1f).height(1.dp).background(MaterialTheme.tokens.borderDefault))
        }
    }
}

private val HOUR_LABEL_RAISE = 10.dp

@Composable
private fun Block(timeline: AgendaTimeline, block: AgendaTimeline.Block, width: Dp, onOpen: (PersonalRow) -> Unit) {
    val row = block.row
    val metrics = timeline.metrics(block)
    val colors = MaterialTheme.tokens.sessionColors(if (row.isGroup) SessionType.Group else SessionType.Private)
    val columnWidth = width / block.columns
    val spoken = spokenLabel(row)
    val cancelled = stringResource(R.string.my_day_cancelled)
    val pill = when (val pill = row.pill) {
        null -> null

        PersonalPill.Full -> stringResource(R.string.my_day_app_full)

        is PersonalPill.Booked ->
            stringResource(R.string.my_calendar_block_booked, pill.booked.toString(), pill.capacity.toString())
    }
    // The substitution (*Je valt in voor Sarah*, *Overgenomen door Mike*, F024) takes the place of the count.
    val startLine = listOfNotNull(row.startText, if (row.isCancelled) cancelled else substitutionText(row) ?: pill)
        .joinToString(START_SEPARATOR)
    // The whole touch area is the block's button: the look is drawn inside it, so the look stays on the minute scale.
    Box(
        Modifier
            .offset(x = LabelWidth + columnWidth * block.column, y = offsetOf(block.top) - metrics.touchAbove.dp)
            .width(columnWidth - Gutter)
            .height(metrics.touchHeight.dp)
            .clickable(role = Role.Button) { onOpen(row) }
            .clearAndSetSemantics {
                semanticsTestTag = AgendaTags.block(row.id)
                contentDescription = spoken
                role = Role.Button
            },
    ) {
        Row(
            Modifier.fillMaxSize()
                .padding(top = metrics.touchAbove.dp, bottom = metrics.touchBelow.dp)
                .alpha(if (row.isPast || row.isCancelled || row.isTakenOver) DIMMED else 1f)
                .background(colors.tint, RoundedCornerShape(Spacing.space2)),
        ) {
            Box(
                Modifier.padding(vertical = Gutter).width(Gutter).fillMaxHeight()
                    .background(colors.solid, RoundedCornerShape(2.dp)),
            )
            Column(Modifier.padding(horizontal = Spacing.space2), verticalArrangement = Arrangement.Center) {
                Text(
                    row.title,
                    color = colors.text,
                    style = MaterialTheme.typography.footnote.copy(fontWeight = FontWeight.SemiBold),
                    textDecoration = if (row.isCancelled) TextDecoration.LineThrough else null,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    startLine,
                    color = colors.text,
                    style = MaterialTheme.typography.caption.numeric(),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

private const val START_SEPARATOR = " · "

/** The now-line, on today, across the day. */
@Composable
private fun NowLine(minutes: Int, width: Dp, name: String) {
    Box(
        Modifier.offset(x = LabelWidth - NOW_DOT / 2, y = offsetOf(minutes) - NOW_DOT / 2)
            .width(width + NOW_DOT / 2).height(NOW_DOT)
            .semantics(mergeDescendants = true) {
                contentDescription = name
                semanticsTestTag = AgendaTags.NOW
            },
        contentAlignment = Alignment.CenterStart,
    ) {
        Box(Modifier.fillMaxWidth().height(2.dp).background(MaterialTheme.tokens.accentFill))
        Box(Modifier.size(NOW_DOT).background(MaterialTheme.tokens.accentFill, CircleShape))
    }
}

private val NOW_DOT = 8.dp

package app.fivvi.pro.attendance

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import app.fivvi.core.R
import app.fivvi.core.kit.AvatarSize
import app.fivvi.core.kit.FivviCard
import app.fivvi.core.kit.InsetGroupedList
import app.fivvi.core.kit.PersonAvatar
import app.fivvi.core.kit.PillButton
import app.fivvi.core.kit.PillButtonStack
import app.fivvi.core.kit.PillButtonStyle
import app.fivvi.core.kit.SegmentedChoice
import app.fivvi.core.kit.SegmentedOption
import app.fivvi.core.theme.numeric
import app.fivvi.core.theme.tokens
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.body
import app.fivvi.designtokens.footnote
import app.fivvi.designtokens.subhead
import app.fivvi.designtokens.title1
import app.fivvi.pro.classes.ClassDateState
import app.fivvi.pro.clients.BackButton
import app.fivvi.pro.personal.PersonalRows
import app.fivvi.pro.sessions.Loading
import app.fivvi.pro.sessions.Notice
import app.fivvi.pro.sessions.SessionFormat
import app.fivvi.pro.sessions.rememberSessionFormat
import java.util.UUID

/** Test tags of CO-05, shared with the iOS accessibility identifiers (`attendance.*`). */
object AttendanceTags {
    const val BACK = "attendance.back"
    const val TITLE = "attendance.title"
    const val SUBTITLE = "attendance.subtitle"
    const val SUMMARY = "attendance.summary"
    const val EVERYONE = "attendance.everyone"
    const val CANCELLED = "attendance.cancelled"
    const val TOO_EARLY = "attendance.tooEarly"
    const val PARTICIPANTS = "attendance.participantsTitle"
    const val LOADING = "attendance.loading"
    const val ERROR = "attendance.error"
    const val RETRY = "attendance.retry"
    const val NO_PERMISSION_TITLE = "attendance.noPermissionTitle"
    const val NO_PERMISSION = "attendance.noPermission"

    /** One participant: `attendance.row.<clientId>`; its two buttons end in `.attended` and `.noShow`. */
    fun row(clientId: UUID) = "attendance.row.$clientId"

    fun button(clientId: UUID, status: AttendanceStatus) =
        "${row(clientId)}.${if (status == AttendanceStatus.ATTENDED) "attended" else "noShow"}"

    fun line(clientId: UUID) = "attendance.row.line.$clientId"
}

/** What CO-05 asks of its host. */
class AttendanceActions(
    val onBack: () -> Unit,
    val onRetry: () -> Unit,
    /** A tap on one of a row's two buttons: the selected one again takes it back to *Geboekt*. */
    val onToggle: (UUID, AttendanceStatus) -> Unit,
    val onEveryone: () -> Unit,
)

/**
 * CO-05 *Aanwezigheid* of a class date (F025, the prototype's *Aanwezigheid les*): the summary as three tiles, announced
 * politely to TalkBack when it changes, *Iedereen aanwezig* as a full-width secondary button, then the participants, each with
 * *Aanwezig* and *Niet verschenen* as a segmented button of at least 48 dp and a check on the selected one. A tap saves at once
 * (no *Opslaan*) through the offline queue: the row says "Wacht op verbinding" until it is sent, and the summary counts what
 * the phone has. Before the window the buttons are off with the time; a cancelled class has none, and a participant who
 * cancelled is read-only. The buttons sit under the name, at large font sizes too.
 */
@Composable
fun AttendanceScreen(
    state: AttendanceState,
    view: AttendanceView,
    workspaceName: String,
    actions: AttendanceActions,
    modifier: Modifier = Modifier,
) {
    val zone = state.header?.zone ?: PersonalRows.TIME_ZONE
    val format = rememberSessionFormat(zone)
    Column(modifier.fillMaxSize().safeDrawingPadding()) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            BackButton(AttendanceTags.BACK, actions.onBack)
        }
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = Spacing.space4),
            verticalArrangement = Arrangement.spacedBy(Spacing.space4),
        ) {
            Title(state)
            when (state.load) {
                AttendanceLoad.Loading -> Loading(AttendanceTags.LOADING)

                AttendanceLoad.Failed -> {
                    Notice(stringResource(R.string.sessions_form_load_failed), AttendanceTags.ERROR, error = true)
                    PillButton(
                        text = stringResource(R.string.common_retry),
                        onClick = actions.onRetry,
                        modifier = Modifier.testTag(AttendanceTags.RETRY),
                    )
                }

                AttendanceLoad.NoPermission -> FivviCard(Modifier.fillMaxWidth()) {
                    Column(verticalArrangement = Arrangement.spacedBy(Spacing.space2)) {
                        Text(
                            text = stringResource(R.string.no_permission_title),
                            modifier = Modifier.testTag(AttendanceTags.NO_PERMISSION_TITLE).semantics { heading() },
                            style = MaterialTheme.typography.title1,
                        )
                        Text(
                            text = stringResource(R.string.no_permission_body, workspaceName),
                            modifier = Modifier.testTag(AttendanceTags.NO_PERMISSION),
                            style = MaterialTheme.typography.body,
                        )
                    }
                }

                AttendanceLoad.Loaded -> Loaded(view, format, actions)
            }
        }
    }
}

@Composable
private fun Title(state: AttendanceState) {
    val header = state.header
    val english = LocalConfiguration.current.locales[0].language != "nl"
    val subtitle = header?.let {
        val name = ClassDateState.pick(english, it.nameNl, it.nameEn)?.text.orEmpty()
        val format = rememberSessionFormat(it.zone)
        // Placeholders in the order of their names: class, end, start.
        stringResource(R.string.attendance_app_subtitle, name, format.time(it.endsAt), format.time(it.startsAt))
    }
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.space1)) {
        Text(
            text = stringResource(R.string.attendance_title),
            modifier = Modifier.fillMaxWidth().testTag(AttendanceTags.TITLE).semantics { heading() },
            style = MaterialTheme.typography.title1,
        )
        subtitle?.let {
            Text(
                text = it,
                modifier = Modifier.fillMaxWidth().testTag(AttendanceTags.SUBTITLE),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.body,
            )
        }
    }
}

@Composable
private fun Loaded(view: AttendanceView, format: SessionFormat, actions: AttendanceActions) {
    val opensAt = view.opensAt
    if (view.isCancelled) {
        Notice(cancelledText(view.isClass), AttendanceTags.CANCELLED, error = false)
    } else if (view.isTooEarly && opensAt != null) {
        Notice(tooEarlyText(opensAt, format), AttendanceTags.TOO_EARLY, error = false)
    }
    Summary(view.summary)
    if (!view.isCancelled) {
        PillButtonStack {
            PillButton(
                text = stringResource(R.string.attendance_everyone),
                onClick = actions.onEveryone,
                modifier = Modifier.testTag(AttendanceTags.EVERYONE),
                style = PillButtonStyle.Tonal,
                enabled = view.canMarkEveryone,
            )
        }
    }
    val rows = view.rows
    if (rows.isNotEmpty()) {
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.space2)) {
            Text(
                text = stringResource(R.string.attendance_participants),
                modifier = Modifier.padding(start = Spacing.space4).testTag(AttendanceTags.PARTICIPANTS)
                    .semantics { heading() },
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.subhead,
            )
            InsetGroupedList {
                rows.forEach { row -> row { Participant(view, row, format, actions) } }
            }
        }
    }
}

/**
 * *Aanwezig 5 · Niet verschenen 1 · Open 1* as three tiles; one element for TalkBack, read as the summary line, and a polite
 * live region, so a change after a tap is announced without interrupting what TalkBack is saying.
 */
@Composable
private fun Summary(summary: Summary) {
    val line = stringResource(
        R.string.attendance_summary,
        summary.attended.toString(),
        summary.noShow.toString(),
        summary.open.toString(),
    )
    val tokens = MaterialTheme.tokens
    Row(
        Modifier.fillMaxWidth().testTag(AttendanceTags.SUMMARY)
            .clearAndSetSemantics {
                contentDescription = line
                liveRegion = LiveRegionMode.Polite
            },
        horizontalArrangement = Arrangement.spacedBy(Spacing.space2),
    ) {
        Tile(stringResource(R.string.attendance_status_attended), summary.attended, tokens.statusSuccessText)
        Tile(stringResource(R.string.attendance_status_no_show), summary.noShow, tokens.statusDangerText)
        Tile(
            stringResource(R.string.attendance_app_open),
            summary.open,
            MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun androidx.compose.foundation.layout.RowScope.Tile(label: String, count: Int, colour: Color) {
    Surface(
        modifier = Modifier.weight(1f),
        shape = RoundedCornerShape(Spacing.space3),
        color = MaterialTheme.colorScheme.surfaceContainerLow,
    ) {
        Column(Modifier.padding(Spacing.space3), verticalArrangement = Arrangement.spacedBy(Spacing.space0_5)) {
            Text(
                text = label,
                color = colour,
                style = MaterialTheme.typography.footnote.copy(fontWeight = FontWeight.SemiBold),
            )
            Text(text = count.toString(), style = MaterialTheme.typography.title1.numeric())
        }
    }
}

/**
 * One participant: the person with the two buttons under the name, at every font size. TalkBack reads
 * the name and, from the buttons, which one is selected ("geselecteerd"); a row that waits or was refused says so under the
 * name. A participant who cancelled is *Geannuleerd* and has no buttons.
 */
@Composable
private fun Participant(view: AttendanceView, row: AttendanceRow, format: SessionFormat, actions: AttendanceActions) {
    val showsButtons = row.status != AttendanceStatus.CANCELLED && !view.isCancelled
    val group = stringResource(R.string.attendance_group_label, row.name)
    val line = when {
        row.refusal != null -> reasonText(row.refusal, view.isClass, format)
        row.status == AttendanceStatus.CANCELLED -> stringResource(R.string.attendance_status_cancelled)
        row.isPending && view.rowsWaitForConnection -> stringResource(R.string.attendance_app_waiting)
        else -> null
    }
    val person: @Composable (Modifier) -> Unit = { modifier ->
        Row(
            modifier,
            horizontalArrangement = Arrangement.spacedBy(Spacing.space3),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            PersonAvatar(row.name)
            Column(Modifier.weight(1f, fill = false), verticalArrangement = Arrangement.spacedBy(Spacing.space0_5)) {
                Text(row.name, style = MaterialTheme.typography.body.copy(fontWeight = FontWeight.SemiBold))
                if (line != null) {
                    Text(
                        text = line,
                        modifier = Modifier.testTag(AttendanceTags.line(row.clientId)),
                        color = if (row.refusal == null) {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        } else {
                            MaterialTheme.colorScheme.error
                        },
                        style = MaterialTheme.typography.footnote,
                    )
                }
            }
        }
    }
    val buttons: @Composable (Modifier) -> Unit = { modifier ->
        SegmentedChoice(
            options = listOf(AttendanceStatus.ATTENDED, AttendanceStatus.NO_SHOW).map {
                SegmentedOption(it, statusLabel(it), AttendanceTags.button(row.clientId, it))
            },
            selected = row.status,
            onSelect = { actions.onToggle(row.clientId, it) },
            modifier = modifier.semantics { contentDescription = group },
            enabled = view.canMark,
            minHeight = AttendanceButtonHeight,
        )
    }
    // The name above the buttons, as the design has it (flow 06's CO-05): the buttons are under the name at every font size, in
    // line with it, and from font scale 150 % on at the row's edge, where each keeps its words on a line or two.
    Column(
        Modifier.fillMaxWidth().testTag(AttendanceTags.row(row.clientId))
            .padding(horizontal = Spacing.space4, vertical = Spacing.space3),
        verticalArrangement = Arrangement.spacedBy(Spacing.space2),
    ) {
        person(Modifier.fillMaxWidth())
        if (showsButtons) buttons(Modifier.padding(start = attendanceIndent(AvatarSize, Spacing.space3)))
    }
}

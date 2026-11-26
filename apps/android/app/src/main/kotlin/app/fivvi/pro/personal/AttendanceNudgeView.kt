package app.fivvi.pro.personal

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.fivvi.core.R
import app.fivvi.core.kit.AvatarSize
import app.fivvi.core.kit.SegmentedChoice
import app.fivvi.core.kit.SegmentedOption
import app.fivvi.core.theme.tokens
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.footnote
import app.fivvi.designtokens.subhead
import app.fivvi.pro.attendance.AttendanceButtonHeight
import app.fivvi.pro.attendance.AttendanceStatus
import app.fivvi.pro.attendance.PersonalNudge
import app.fivvi.pro.attendance.attendanceIndent
import app.fivvi.pro.attendance.reasonText
import app.fivvi.pro.sessions.rememberSessionFormat

/** The test tags of a row's nudge, shared with the iOS accessibility identifiers (`today.nudge.*`). */
object NudgeTags {
    /** The line *Aanwezigheid nog invullen* (or *Wacht op verbinding*) of a row: `<prefix>.nudge.<id>`. */
    fun line(prefix: String, id: java.util.UUID) = "$prefix.nudge.$id"

    /** What the API refused the last tap with, under the line. */
    fun message(prefix: String, id: java.util.UUID) = "$prefix.nudge.message.$id"

    /** *Aanwezig* and *Niet verschenen* under the row: `<prefix>.nudge.<id>.attended` and `.noShow`. */
    fun button(prefix: String, id: java.util.UUID, status: AttendanceStatus) =
        "$prefix.nudge.$id.${if (status == AttendanceStatus.ATTENDED) "attended" else "noShow"}"
}

/**
 * What an ended session still owing attendance shows under its row (F025, Q18): for a private session with one client, the
 * line *Aanwezigheid nog invullen* with *Aanwezig* and *Niet verschenen* as the inline buttons Android has in place of swipe
 * actions, at least 48 dp high. While the tap waits for the connection the line says *Wacht op verbinding* and the buttons are
 * gone; a tap the API refused brings them back with its reason. An ended class (or a duo) has the line alone, which opens CO-05
 * (TD-02 for a duo).
 */
@Composable
internal fun AttendanceNudgeView(
    row: PersonalRow,
    tagPrefix: String,
    onMark: (AttendanceStatus) -> Unit,
    onOpenAttendance: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val nudge = row.nudge
    if (nudge == null && !row.attendanceLine) return
    Column(
        modifier.fillMaxWidth().padding(
            start = Spacing.space4 + attendanceIndent(AvatarSize, Spacing.space3 + Spacing.space0_5),
            end = Spacing.space4,
            bottom = Spacing.space3,
        ),
        verticalArrangement = Arrangement.spacedBy(Spacing.space2),
    ) {
        val text = when {
            nudge?.isWaiting == true -> stringResource(R.string.attendance_app_waiting)
            else -> stringResource(R.string.attendance_nudge)
        }
        val lineModifier = Modifier.fillMaxWidth().defaultMinSize(minHeight = AttendanceButtonHeight)
        Row(
            // A line alone is the way into CO-05 (or TD-02): the whole line is the target.
            if (nudge == null) {
                // One element for TalkBack and the tag, so the line is found and read as a button.
                lineModifier.testTag(NudgeTags.line(tagPrefix, row.id)).clickable(
                    role = Role.Button,
                    onClick = onOpenAttendance,
                )
            } else {
                lineModifier
            },
            horizontalArrangement = Arrangement.spacedBy(Spacing.space2),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                painterResource(R.drawable.ic_warning),
                contentDescription = null,
                modifier = Modifier.size(18.dp),
                tint = MaterialTheme.tokens.statusWarningText,
            )
            Text(
                text,
                modifier = if (nudge == null) Modifier else Modifier.testTag(NudgeTags.line(tagPrefix, row.id)),
                color = MaterialTheme.tokens.statusWarningText,
                style = MaterialTheme.typography.subhead,
            )
        }
        if (nudge != null && !nudge.isWaiting) Buttons(row, nudge, tagPrefix, onMark)
    }
}

@Composable
private fun Buttons(row: PersonalRow, nudge: PersonalNudge, tagPrefix: String, onMark: (AttendanceStatus) -> Unit) {
    val format = rememberSessionFormat(nudge.zone)
    nudge.refusal?.let {
        Text(
            text = reasonText(it, isClass = false, format),
            modifier = Modifier.testTag(NudgeTags.message(tagPrefix, row.id)),
            color = MaterialTheme.colorScheme.error,
            style = MaterialTheme.typography.footnote,
        )
    }
    val group = stringResource(R.string.attendance_group_label, nudge.clientName)
    SegmentedChoice(
        options = listOf(AttendanceStatus.ATTENDED, AttendanceStatus.NO_SHOW).map {
            SegmentedOption(
                it,
                stringResource(
                    if (it == AttendanceStatus.ATTENDED) {
                        R.string.attendance_status_attended
                    } else {
                        R.string.attendance_status_no_show
                    },
                ),
                NudgeTags.button(tagPrefix, row.id, it),
            )
        },
        selected = null,
        onSelect = onMark,
        modifier = Modifier.semantics { contentDescription = group },
        minHeight = AttendanceButtonHeight,
    )
}

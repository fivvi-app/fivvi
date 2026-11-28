package app.fivvi.pro.attendance

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.fivvi.core.R
import app.fivvi.core.kit.InsetGroupedList
import app.fivvi.core.kit.SegmentedChoice
import app.fivvi.core.kit.SegmentedOption
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.body
import app.fivvi.designtokens.footnote
import app.fivvi.designtokens.subhead
import app.fivvi.pro.sessions.rememberSessionFormat
import java.time.ZoneId
import java.util.UUID

/** Test tags of TD-02's section, shared with the iOS accessibility identifiers (`session.attendance.*`). */
object AttendanceSectionTags {
    const val TITLE = "session.attendance.title"
    const val NOTE = "session.attendance.note"

    /** The control of one client: `session.attendance.<clientId>`; its segments end in `.booked`, `.attended`, `.noShow`. */
    fun control(clientId: UUID) = "session.attendance.$clientId"

    fun segment(clientId: UUID, status: AttendanceStatus) = "${control(clientId)}.${segmentName(status)}"

    fun line(clientId: UUID) = "session.attendance.line.$clientId"

    private fun segmentName(status: AttendanceStatus) = when (status) {
        AttendanceStatus.BOOKED -> "booked"
        AttendanceStatus.ATTENDED -> "attended"
        AttendanceStatus.NO_SHOW -> "noShow"
        AttendanceStatus.CANCELLED -> "cancelled"
    }
}

/**
 * How far the buttons under a name are indented, to sit under the name and not under the avatar (the prototype): [avatar] and the
 * [gap] to the name. At large font sizes the buttons need the width, so they start at the row's edge (flow 06: "same at font
 * scale ≥ 150 %").
 */
@Composable
internal fun attendanceIndent(avatar: Dp, gap: Dp): Dp = if (LocalDensity.current.fontScale >=
    WIDE_FONT_SCALE
) {
    0.dp
} else {
    avatar + gap
}

private const val WIDE_FONT_SCALE = 1.5f

/** What a button of attendance is at least high: tapped between sessions, so larger than the kit's 40 dp (flow 06). */
internal val AttendanceButtonHeight = 48.dp

/**
 * TD-02's *Aanwezigheid* section (F025, `DECISIONS.md` §3, "Attendance as a segmented control"): *Geboekt | Aanwezig | Niet
 * verschenen* for the client (one control per client of a duo, each named), at least 48 dp high with a check on the selected
 * one, saving at once through the offline queue. Before the window opens the control is off with "Vanaf 08:30."; on a
 * cancelled session with "Geannuleerd.". A row that waits for the connection says "Wacht op verbinding"; a request the API
 * refused reverts the row with its message. Shows nothing until the participants are read, and for a session without any.
 */
@Composable
fun AttendanceSection(
    view: AttendanceView,
    loaded: Boolean,
    zone: ZoneId,
    onSet: (UUID, AttendanceStatus) -> Unit,
    modifier: Modifier = Modifier,
) {
    val rows = view.rows
    if (!loaded || rows.isEmpty()) return
    val format = rememberSessionFormat(zone)
    Column(modifier, verticalArrangement = Arrangement.spacedBy(Spacing.space2)) {
        Text(
            text = stringResource(R.string.attendance_title),
            modifier = Modifier.padding(start = Spacing.space4).testTag(AttendanceSectionTags.TITLE)
                .semantics { heading() },
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.subhead,
        )
        InsetGroupedList {
            rows.forEach { row -> row { Control(view, row, named = rows.size > 1, format, onSet) } }
        }
        val opensAt = view.opensAt
        val note = when {
            view.isCancelled -> stringResource(R.string.attendance_app_cancelled)
            view.isTooEarly && opensAt != null -> fromText(opensAt, format)
            else -> null
        }
        if (note != null) {
            Text(
                text = note,
                modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.space4)
                    .testTag(AttendanceSectionTags.NOTE),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.footnote,
            )
        }
    }
}

@Composable
private fun Control(
    view: AttendanceView,
    row: AttendanceRow,
    named: Boolean,
    format: app.fivvi.pro.sessions.SessionFormat,
    onSet: (UUID, AttendanceStatus) -> Unit,
) {
    val group = stringResource(R.string.attendance_group_label, row.name)
    Column(
        Modifier.fillMaxWidth().padding(horizontal = Spacing.space4, vertical = Spacing.space3),
        verticalArrangement = Arrangement.spacedBy(Spacing.space2),
    ) {
        if (named) {
            Text(row.name, style = MaterialTheme.typography.body.copy(fontWeight = FontWeight.SemiBold))
        }
        val options = listOf(AttendanceStatus.BOOKED, AttendanceStatus.ATTENDED, AttendanceStatus.NO_SHOW).map {
            SegmentedOption(it, statusLabel(it), AttendanceSectionTags.segment(row.clientId, it))
        }
        SegmentedChoice(
            options = options,
            selected = row.status,
            onSelect = { onSet(row.clientId, it) },
            modifier = Modifier.testTag(AttendanceSectionTags.control(row.clientId))
                .semantics { contentDescription = group },
            enabled = view.canMark,
            minHeight = AttendanceButtonHeight,
        )
        val line = when {
            row.refusal != null -> reasonText(row.refusal, view.isClass, format)
            row.isPending && view.rowsWaitForConnection -> stringResource(R.string.attendance_app_waiting)
            else -> null
        }
        if (line != null) {
            Text(
                text = line,
                modifier = Modifier.testTag(AttendanceSectionTags.line(row.clientId)),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.footnote,
            )
        }
    }
}

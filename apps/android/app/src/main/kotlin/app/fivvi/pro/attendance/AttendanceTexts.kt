package app.fivvi.pro.attendance

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import app.fivvi.core.R
import app.fivvi.pro.sessions.SessionFormat
import java.time.Instant
import java.time.ZoneOffset

/**
 * The words of attendance, read from the string catalog when a screen is drawn: the state of the screens holds no text, so a
 * language switched while TD-02 or CO-05 is open changes them at once (#1619).
 */
@Composable
internal fun statusLabel(status: AttendanceStatus): String = stringResource(
    when (status) {
        AttendanceStatus.BOOKED -> R.string.attendance_status_booked
        AttendanceStatus.ATTENDED -> R.string.attendance_status_attended
        AttendanceStatus.NO_SHOW -> R.string.attendance_status_no_show
        AttendanceStatus.CANCELLED -> R.string.attendance_status_cancelled
    },
)

/** *Aanwezigheid kun je invullen vanaf 17:30.* */
@Composable
internal fun tooEarlyText(opensAt: Instant, format: SessionFormat): String =
    stringResource(R.string.attendance_too_early, format.time(opensAt.atOffset(ZoneOffset.UTC)))

/** *Vanaf 08:30.*, under TD-02's control while it is off for being early. */
@Composable
internal fun fromText(opensAt: Instant, format: SessionFormat): String =
    stringResource(R.string.attendance_app_from, format.time(opensAt.atOffset(ZoneOffset.UTC)))

/** *Deze les is geannuleerd. Aanwezigheid is niet nodig.*, and the private variant. */
@Composable
internal fun cancelledText(isClass: Boolean): String = stringResource(
    if (isClass) R.string.attendance_cancelled_class else R.string.attendance_cancelled_session,
)

/** What a row says when the API refused a tap on its way (AC9): the same words on TD-02, CO-05 and the nudge of Vandaag. */
@Composable
internal fun reasonText(reason: Reason, isClass: Boolean, format: SessionFormat): String = when (reason) {
    Reason.SessionCancelled -> cancelledText(isClass)
    Reason.ParticipantCancelled -> stringResource(R.string.attendance_errors_participant_cancelled)
    is Reason.TooEarly -> tooEarlyText(reason.opensAt, format)
    Reason.Other -> stringResource(R.string.attendance_errors_generic)
}

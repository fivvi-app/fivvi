package app.fivvi.pro.sessions

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import app.fivvi.api.models.Locale
import app.fivvi.core.R
import app.fivvi.core.kit.InsetGroupedList
import app.fivvi.core.kit.PillButton
import app.fivvi.core.kit.PillButtonHeight
import app.fivvi.core.kit.PillButtonStack
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.body
import app.fivvi.designtokens.headline

/** Test tags, shared with the iOS accessibility identifiers and the Maestro flows. */
object RescheduleTags {
    const val PREFIX = "reschedule"
    const val TITLE = "reschedule.title"
    const val CANCEL = "reschedule.cancel"
    const val SUBTITLE = "reschedule.subtitle"
    const val CURRENT = "reschedule.current"
    const val LOCATION = "reschedule.location"
    const val NOTIFY = "reschedule.notify"
    const val NOTIFY_NOTE = "reschedule.notifyNote"
    const val FAILED = "reschedule.failed"
    const val SUBMIT = "reschedule.submit"
    const val PENDING = "reschedule.pending"
}

/** What PS-05 asks of its host. */
class RescheduleActions(
    val onClose: () -> Unit,
    val onSubmit: () -> Unit,
    /** *Toch opslaan* of PS-07: the same move again, with `allowConflicts`. */
    val onSaveAnyway: () -> Unit,
    /** *Terug* of PS-07. */
    val onDismissDoubleBooking: () -> Unit,
    val onNotify: (Boolean) -> Unit,
    val time: SessionTimeActions,
)

/**
 * PS-05 *Sessie verplaatsen* (F020 AC6) as a full-screen dialog over the session screen: where the session is now, the new
 * date, start and length, the location (unchanged), and whether the client gets the change by email. The main button at
 * the bottom says what happens: *Verplaatsen* or *Verplaatsen en informeren*. The API's `409` and time messages are shown
 * as it words them ([RescheduleViewModel]).
 */
@Composable
fun RescheduleScreen(
    state: RescheduleState,
    clientName: String,
    emailLocale: Locale,
    actions: RescheduleActions,
    modifier: Modifier = Modifier,
) {
    val session = state.session
    val format = rememberSessionFormat(state.zone)
    Column(modifier.fillMaxSize().safeDrawingPadding()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.space2, vertical = Spacing.space2),
            horizontalArrangement = Arrangement.spacedBy(Spacing.space2),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = actions.onClose, modifier = Modifier.testTag(RescheduleTags.CANCEL)) {
                Icon(
                    painterResource(R.drawable.ic_close),
                    contentDescription = stringResource(R.string.sessions_reschedule_cancel),
                )
            }
            Text(
                text = stringResource(R.string.sessions_reschedule_title),
                modifier = Modifier.weight(1f).testTag(RescheduleTags.TITLE).semantics { heading() },
                style = MaterialTheme.typography.headline,
                textAlign = TextAlign.Center,
            )
            // The close button's width again on the other side, so the title stays in the middle.
            Spacer(Modifier.size(PillButtonHeight))
        }
        Column(
            modifier = Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(Spacing.space4),
            verticalArrangement = Arrangement.spacedBy(Spacing.space4),
        ) {
            Text(
                text = stringResource(R.string.sessions_reschedule_subtitle, clientName),
                modifier = Modifier.testTag(RescheduleTags.SUBTITLE),
                style = MaterialTheme.typography.body,
            )
            Text(
                text = stringResource(
                    R.string.sessions_reschedule_current,
                    format.dayYear(session.startsAt),
                    format.time(session.endsAt),
                    session.location.name,
                    format.time(session.startsAt),
                ),
                modifier = Modifier.testTag(RescheduleTags.CURRENT),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.body,
            )
            SessionTimeSection(
                time = state.time,
                endsAt = state.endsAt,
                zone = state.zone,
                dateLabel = stringResource(R.string.sessions_reschedule_date_label),
                idPrefix = RescheduleTags.PREFIX,
                actions = actions.time,
            )
            InsetGroupedList {
                row {
                    Text(
                        text = stringResource(R.string.sessions_reschedule_location_unchanged, session.location.name),
                        modifier = Modifier.fillMaxWidth().testTag(RescheduleTags.LOCATION)
                            .padding(horizontal = Spacing.space4, vertical = Spacing.space3),
                        style = MaterialTheme.typography.body,
                    )
                }
                row {
                    SwitchRow(
                        text = stringResource(R.string.sessions_reschedule_notify, clientName),
                        checked = state.notify,
                        onCheckedChange = actions.onNotify,
                        tag = RescheduleTags.NOTIFY,
                    )
                }
            }
            FormNote(
                stringResource(R.string.sessions_reschedule_notify_note, clientName, languageName(emailLocale)),
                RescheduleTags.NOTIFY_NOTE,
            )
            failureText(state.failure)?.let { Notice(it, RescheduleTags.FAILED, error = true) }
        }
        Column(Modifier.fillMaxWidth().padding(Spacing.space4)) {
            if (state.saving) {
                val label = stringResource(R.string.common_loading)
                CircularProgressIndicator(
                    Modifier.align(Alignment.CenterHorizontally).testTag(RescheduleTags.PENDING)
                        .semantics { contentDescription = label },
                )
            } else {
                PillButtonStack {
                    PillButton(
                        text = stringResource(
                            if (state.notify) {
                                R.string.sessions_reschedule_submit_notify
                            } else {
                                R.string.sessions_reschedule_submit
                            },
                        ),
                        onClick = actions.onSubmit,
                        modifier = Modifier.testTag(RescheduleTags.SUBMIT),
                    )
                }
            }
        }
    }
    state.doubleBooking?.let {
        DoubleBookingDialog(it, state.zone, RescheduleTags.PREFIX, actions.onDismissDoubleBooking, actions.onSaveAnyway)
    }
}

@Composable
private fun failureText(failure: RescheduleFailure?): String? = when (failure) {
    is RescheduleFailure.Changed -> failure.byName?.let { stringResource(R.string.sessions_reschedule_changed_by, it) }
        ?: stringResource(R.string.sessions_reschedule_changed_by_unknown)

    RescheduleFailure.Cancelled -> stringResource(R.string.sessions_reschedule_cancelled)

    RescheduleFailure.NoPermission -> stringResource(R.string.sessions_reschedule_no_permission)

    RescheduleFailure.NotSaved -> stringResource(R.string.sessions_form_errors_not_saved)

    null -> null
}

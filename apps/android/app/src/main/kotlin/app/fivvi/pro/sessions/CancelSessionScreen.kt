package app.fivvi.pro.sessions

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import app.fivvi.core.R
import app.fivvi.core.kit.CheckListRow
import app.fivvi.core.kit.InsetGroupedList
import app.fivvi.core.kit.PillButton
import app.fivvi.core.kit.PillButtonStack
import app.fivvi.core.kit.PillButtonStyle
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.body
import app.fivvi.designtokens.headline
import java.time.ZoneId

/** Test tags, shared with the iOS accessibility identifiers and the Maestro flows. */
object CancelSessionTags {
    const val TITLE = "cancel.title"
    const val SUBTITLE = "cancel.subtitle"
    const val WHO = "cancel.who"
    const val WHO_CLIENT = "cancel.who.client"
    const val WHO_WORKSPACE = "cancel.who.workspace"
    const val NUDGE = "cancel.nudge"
    const val RESCHEDULE = "cancel.reschedule"
    const val CANCEL_ANYWAY = "cancel.cancelAnyway"
    const val NOTIFY = "cancel.notify"
    const val NOTIFY_NOTE = "cancel.notifyNote"
    const val STARTED = "cancel.started"
    const val FAILED = "cancel.failed"
    const val SUBMIT = "cancel.submit"
    const val BACK = "cancel.back"
    const val PENDING = "cancel.pending"
}

/** What PS-06 asks of its host. */
class CancelSessionActions(
    val onChoose: (CancelInitiator) -> Unit,
    val onNotify: (Boolean) -> Unit,
    /** *Toch annuleren* of the question. */
    val onCancelAnyway: () -> Unit,
    /** *Verplaatsen* of the question: PS-05 opens for the same session, nothing is cancelled. */
    val onReschedule: () -> Unit,
    val onSubmit: () -> Unit,
    /** *Terug*. */
    val onBack: () -> Unit,
)

/**
 * PS-06 *Sessie annuleren?* (F026) over the session screen: the client and when, *Wie annuleert?* (*De klant* or *Wij*),
 * then, with *De klant*, the question *Al een ander moment voorgesteld?* with **Verplaatsen** (opens PS-05) and *Toch
 * annuleren*, else the email box and the destructive *Sessie annuleren* above *Terug*. The API's `409` words are shown as it
 * words them ([CancelSessionViewModel]); offline the button is off and says so.
 */
@Composable
fun CancelSessionScreen(state: CancelSessionState, actions: CancelSessionActions, modifier: Modifier = Modifier) {
    val format = rememberSessionFormat(ZoneId.of(state.session.timeZone))
    Column(modifier.fillMaxSize().safeDrawingPadding()) {
        Text(
            text = stringResource(R.string.sessions_cancel_title),
            modifier = Modifier.fillMaxWidth().padding(Spacing.space4).testTag(CancelSessionTags.TITLE)
                .semantics { heading() },
            style = MaterialTheme.typography.headline,
            textAlign = TextAlign.Center,
        )
        Column(
            modifier = Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(Spacing.space4),
            verticalArrangement = Arrangement.spacedBy(Spacing.space4),
        ) {
            Text(
                // Placeholders in the order of their names: client, date, end, start.
                text = stringResource(
                    R.string.sessions_cancel_subtitle,
                    state.clientName,
                    format.day(state.session.startsAt),
                    format.time(state.session.endsAt),
                    format.time(state.session.startsAt),
                ),
                modifier = Modifier.testTag(CancelSessionTags.SUBTITLE),
                style = MaterialTheme.typography.body,
            )
            Text(
                text = stringResource(R.string.sessions_cancel_who_label),
                modifier = Modifier.testTag(CancelSessionTags.WHO).semantics { heading() },
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.body,
            )
            Column(Modifier.selectableGroup()) {
                InsetGroupedList {
                    row {
                        CheckListRow(
                            label = stringResource(R.string.sessions_cancel_who_client),
                            selected = state.initiator == CancelInitiator.Client,
                            onClick = { actions.onChoose(CancelInitiator.Client) },
                            tag = CancelSessionTags.WHO_CLIENT,
                        )
                    }
                    row {
                        CheckListRow(
                            label = stringResource(R.string.sessions_cancel_who_us),
                            selected = state.initiator == CancelInitiator.Workspace,
                            onClick = { actions.onChoose(CancelInitiator.Workspace) },
                            tag = CancelSessionTags.WHO_WORKSPACE,
                        )
                    }
                }
            }
            when (state.step) {
                CancelStep.Nudge -> Nudge(actions)
                CancelStep.Confirm -> Confirm(state, actions)
            }
            failureText(state.failure)?.let {
                Notice(it, CancelSessionTags.FAILED, error = !state.isOffline)
            }
        }
        Buttons(state, actions)
    }
}

// *Al een ander moment voorgesteld?* with **Verplaatsen** as the main button and *Toch annuleren* beside it.
@Composable
private fun Nudge(actions: CancelSessionActions) {
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.space3)) {
        Text(
            text = stringResource(R.string.sessions_cancel_nudge_question),
            modifier = Modifier.testTag(CancelSessionTags.NUDGE),
            style = MaterialTheme.typography.body.copy(fontWeight = FontWeight.SemiBold),
        )
        PillButtonStack {
            PillButton(
                text = stringResource(R.string.sessions_cancel_nudge_reschedule),
                onClick = actions.onReschedule,
                modifier = Modifier.testTag(CancelSessionTags.RESCHEDULE),
            )
            PillButton(
                text = stringResource(R.string.sessions_cancel_nudge_cancel_anyway),
                onClick = actions.onCancelAnyway,
                modifier = Modifier.testTag(CancelSessionTags.CANCEL_ANYWAY),
                style = PillButtonStyle.Tonal,
            )
        }
    }
}

// The email box with its note, or, for a session that has started, that nothing is sent.
@Composable
private fun Confirm(state: CancelSessionState, actions: CancelSessionActions) {
    if (state.started) {
        Notice(stringResource(R.string.sessions_cancel_started), CancelSessionTags.STARTED, error = false)
        return
    }
    InsetGroupedList {
        row {
            SwitchRow(
                text = stringResource(R.string.sessions_cancel_notify, state.clientName),
                checked = state.notify,
                onCheckedChange = actions.onNotify,
                tag = CancelSessionTags.NOTIFY,
            )
        }
    }
    state.clientEmail?.let {
        FormNote(
            stringResource(R.string.sessions_cancel_notify_note, it, languageName(state.emailLocale)),
            CancelSessionTags.NOTIFY_NOTE,
        )
    }
}

// *Sessie annuleren* (destructive, only in the confirm step) above *Terug*.
@Composable
private fun Buttons(state: CancelSessionState, actions: CancelSessionActions) {
    Column(Modifier.fillMaxWidth().padding(Spacing.space4)) {
        if (state.saving) {
            val label = stringResource(R.string.common_loading)
            CircularProgressIndicator(
                Modifier.align(Alignment.CenterHorizontally).testTag(CancelSessionTags.PENDING)
                    .semantics { contentDescription = label },
            )
        } else {
            PillButtonStack {
                if (state.step == CancelStep.Confirm) {
                    PillButton(
                        text = stringResource(R.string.sessions_cancel_submit),
                        onClick = actions.onSubmit,
                        modifier = Modifier.testTag(CancelSessionTags.SUBMIT),
                        style = PillButtonStyle.Danger,
                        enabled = state.canSubmit,
                    )
                }
                PillButton(
                    text = stringResource(R.string.sessions_cancel_back),
                    onClick = actions.onBack,
                    modifier = Modifier.testTag(CancelSessionTags.BACK),
                    style = PillButtonStyle.Tonal,
                )
            }
        }
    }
}

@Composable
private fun failureText(failure: CancelFailure?): String? = when (failure) {
    is CancelFailure.Changed -> failure.byName?.let { stringResource(R.string.sessions_cancel_changed_by, it) }
        ?: stringResource(R.string.sessions_cancel_changed_by_unknown)

    CancelFailure.Cancelled -> stringResource(R.string.sessions_cancel_already_cancelled)

    CancelFailure.NoPermission -> stringResource(R.string.sessions_cancel_no_permission)

    CancelFailure.NotSaved -> stringResource(R.string.sessions_form_errors_not_saved)

    CancelFailure.Offline -> stringResource(R.string.sessions_cancel_offline)

    null -> null
}

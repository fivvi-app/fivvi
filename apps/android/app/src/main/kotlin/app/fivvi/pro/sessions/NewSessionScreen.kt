package app.fivvi.pro.sessions

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import app.fivvi.api.models.Locale
import app.fivvi.api.models.Trainer
import app.fivvi.core.R
import app.fivvi.core.TrainerWordForms
import app.fivvi.core.kit.FieldErrorLine
import app.fivvi.core.kit.FivviCard
import app.fivvi.core.kit.InsetGroupedList
import app.fivvi.core.kit.PillButton
import app.fivvi.core.trainerWordForms
import app.fivvi.core.ui.testTagsAsIds
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.body
import app.fivvi.pro.clients.ClientFormBarTags
import app.fivvi.pro.clients.ClientFormFrame
import java.util.UUID

/** Test tags, shared with the iOS accessibility identifiers and the Maestro flows. */
object NewSessionTags {
    const val PREFIX = "newSession"
    const val TITLE = "newSession.title"
    const val CANCEL = "newSession.cancel"
    const val SAVE = "newSession.save"
    const val PENDING = "newSession.pending"
    const val LOADING = "newSession.loading"
    const val LOAD_FAILED = "newSession.loadFailed"
    const val RETRY = "newSession.retry"
    const val OFFLINE = "newSession.offline"
    const val NO_PERMISSION = "newSession.noPermission"
    const val CLIENT = "newSession.client"
    const val CLIENT_NAME = "newSession.clientName"
    const val CLIENT_ERROR = "newSession.clientError"
    const val TRAINER = "newSession.trainer"
    const val TRAINER_VALUE = "newSession.trainerValue"
    const val TRAINER_FIXED = "newSession.trainerFixed"
    const val TRAINER_ERROR = "newSession.trainerError"
    const val LOCATION = "newSession.location"
    const val NOTIFY = "newSession.notify"
    const val NOTIFY_NOTE = "newSession.notifyNote"
    const val FAILED = "newSession.failed"
    const val DISCARD = "newSession.discard"
    const val KEEP_EDITING = "newSession.keepEditing"
}

/** What PS-04 asks of its host. */
class NewSessionActions(
    val onClose: () -> Unit,
    val onSave: () -> Unit,
    /** *Toch opslaan* of PS-07: the same save again, with `allowConflicts`. */
    val onSaveAnyway: () -> Unit,
    /** *Terug* of PS-07. */
    val onDismissDoubleBooking: () -> Unit,
    val onRetry: () -> Unit,
    val onPickClient: () -> Unit,
    val onNotify: (Boolean) -> Unit,
    val onTrainer: (UUID) -> Unit,
    val time: SessionTimeActions,
)

/**
 * PS-04 *Nieuwe privésessie* (F020 AC1, AC2, AC10) as a full-screen dialog (`information-architecture.md §5.2`): ✕ and
 * *Opslaan* in the bar, then the client (a row that opens the searchable list), the date, the start, the length, *Eindigt
 * om…*, the trainer (an Owner chooses, a Trainer is fixed), the location and whether the client gets the confirmation.
 * Leaving with something entered asks first. Without a connection the form says so and *Opslaan* is off; nothing is
 * queued. [ownName] is the person's own name, which a Trainer sees on the fixed trainer row; [workspaceName] is named when
 * the person has no access.
 */
@Composable
fun NewSessionScreen(
    state: NewSessionState,
    forAnyTrainer: Boolean,
    ownName: String,
    workspaceName: String,
    confirmingDiscard: Boolean,
    onDismissDiscard: () -> Unit,
    onDiscard: () -> Unit,
    actions: NewSessionActions,
    modifier: Modifier = Modifier,
) {
    val forms = trainerWordForms(state.workspace.trainerWord)
    ClientFormFrame(
        title = stringResource(R.string.sessions_form_title),
        tags = ClientFormBarTags(
            NewSessionTags.TITLE,
            NewSessionTags.CANCEL,
            NewSessionTags.SAVE,
            NewSessionTags.PENDING,
        ),
        submitText = stringResource(R.string.sessions_form_save),
        pending = state.saving,
        onClose = actions.onClose,
        onSubmit = actions.onSave,
        modifier = modifier,
        submitEnabled = state.canSave,
        closeLabel = stringResource(R.string.sessions_form_close),
    ) {
        if (state.isOffline) {
            Offline(actions.onRetry)
        }
        when (state.load) {
            NewSessionLoad.Loading -> Loading(NewSessionTags.LOADING)

            NewSessionLoad.Failed -> {
                Notice(stringResource(R.string.sessions_form_load_failed), NewSessionTags.LOAD_FAILED, error = true)
                PillButton(
                    text = stringResource(R.string.common_retry),
                    onClick = actions.onRetry,
                    modifier = Modifier.testTag(NewSessionTags.RETRY),
                )
            }

            NewSessionLoad.Offline -> Unit

            NewSessionLoad.NoPermission -> NoPermission(workspaceName)

            NewSessionLoad.Ready -> Fields(state, forAnyTrainer, ownName, forms, actions)
        }
    }
    if (confirmingDiscard) {
        AlertDialog(
            onDismissRequest = onDismissDiscard,
            modifier = Modifier.testTagsAsIds(),
            confirmButton = {
                TextButton(onClick = onDiscard, modifier = Modifier.testTag(NewSessionTags.DISCARD)) {
                    Text(stringResource(R.string.sessions_form_discard))
                }
            },
            dismissButton = {
                TextButton(onClick = onDismissDiscard, modifier = Modifier.testTag(NewSessionTags.KEEP_EDITING)) {
                    Text(stringResource(R.string.sessions_form_keep_editing))
                }
            },
            title = { Text(stringResource(R.string.sessions_form_discard_title)) },
            text = { Text(stringResource(R.string.sessions_form_discard_description)) },
        )
    }
    state.doubleBooking?.let {
        DoubleBookingDialog(
            it,
            state.workspace.zone,
            NewSessionTags.PREFIX,
            actions.onDismissDoubleBooking,
            actions.onSaveAnyway,
        )
    }
}

@Composable
private fun Offline(onRetry: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.space2)) {
        Notice(stringResource(R.string.sessions_form_offline), NewSessionTags.OFFLINE, error = false)
        PillButton(
            text = stringResource(R.string.common_retry),
            onClick = onRetry,
            modifier = Modifier.testTag(NewSessionTags.RETRY),
        )
    }
}

/** A message in a block: [error] colours it as an error, otherwise as information. */
@Composable
internal fun Notice(text: String, tag: String, error: Boolean) {
    Text(
        text = text,
        modifier = Modifier.fillMaxWidth().testTag(tag).semantics { liveRegion = LiveRegionMode.Polite },
        color = if (error) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
        style = MaterialTheme.typography.body,
    )
}

@Composable
internal fun Loading(tag: String) {
    val label = stringResource(R.string.common_loading)
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(Modifier.testTag(tag).semantics { contentDescription = label })
    }
}

@Composable
private fun NoPermission(workspaceName: String) {
    FivviCard(Modifier.fillMaxWidth().testTag(NewSessionTags.NO_PERMISSION)) {
        Text(text = stringResource(R.string.no_permission_body, workspaceName), style = MaterialTheme.typography.body)
    }
}

@Composable
private fun Fields(
    state: NewSessionState,
    forAnyTrainer: Boolean,
    ownName: String,
    forms: TrainerWordForms,
    actions: NewSessionActions,
) {
    val client = state.client
    InsetGroupedList {
        row {
            FormRow(
                label = stringResource(R.string.sessions_form_client_label),
                value = client?.name ?: stringResource(R.string.sessions_form_client_placeholder),
                tag = NewSessionTags.CLIENT,
                valueTag = NewSessionTags.CLIENT_NAME,
                onClick = actions.onPickClient,
                muted = client == null,
            )
        }
    }
    if (state.clientMissing) {
        Box(Modifier.padding(horizontal = Spacing.space4)) {
            FieldErrorLine(
                stringResource(R.string.sessions_form_errors_choose_client),
                Modifier.testTag(NewSessionTags.CLIENT_ERROR),
            )
        }
    }
    SessionTimeSection(
        time = state.time,
        endsAt = state.endsAt,
        zone = state.workspace.zone,
        dateLabel = stringResource(R.string.sessions_form_date_label),
        idPrefix = NewSessionTags.PREFIX,
        actions = actions.time,
    )
    InsetGroupedList {
        row { TrainerRow(state, forAnyTrainer, ownName, forms, actions.onTrainer) }
        row {
            Text(
                text = stringResource(R.string.sessions_form_location, state.locationName),
                modifier = Modifier.fillMaxWidth().testTag(NewSessionTags.LOCATION)
                    .padding(horizontal = Spacing.space4, vertical = Spacing.space3),
                style = MaterialTheme.typography.body,
            )
        }
    }
    if (state.trainerMissing) {
        Box(Modifier.padding(horizontal = Spacing.space4)) {
            FieldErrorLine(
                stringResource(R.string.sessions_form_errors_choose_trainer, forms.aWord),
                Modifier.testTag(NewSessionTags.TRAINER_ERROR),
            )
        }
    }
    if (client != null) {
        InsetGroupedList {
            row {
                SwitchRow(
                    text = stringResource(R.string.sessions_form_notify, client.name),
                    checked = state.notify,
                    onCheckedChange = actions.onNotify,
                    tag = NewSessionTags.NOTIFY,
                )
            }
        }
        FormNote(
            stringResource(R.string.sessions_form_notify_note, client.email, languageName(state.emailLocale)),
            NewSessionTags.NOTIFY_NOTE,
        )
    }
    val failure = when (state.saveFailure) {
        SaveFailure.NoPermission -> stringResource(R.string.sessions_form_errors_no_permission)
        SaveFailure.NotSaved -> stringResource(R.string.sessions_form_errors_not_saved)
        null -> null
    }
    failure?.let { Notice(it, NewSessionTags.FAILED, error = true) }
}

/** *in het Nederlands* or *in het Engels*: the language an email goes out in. */
@Composable
internal fun languageName(locale: Locale): String =
    stringResource(if (locale == Locale.EN) R.string.sessions_form_language_en else R.string.sessions_form_language_nl)

// An Owner chooses among the trainers (themself first as *{name} (ik)*); a Trainer plans for themself and sees their own
// name, which no one can change.
@Composable
private fun TrainerRow(
    state: NewSessionState,
    forAnyTrainer: Boolean,
    ownName: String,
    forms: TrainerWordForms,
    onTrainer: (UUID) -> Unit,
) {
    val label = stringResource(R.string.sessions_form_trainer_label, forms.wordCap)
    if (!forAnyTrainer) {
        FormRow(
            label,
            stringResource(R.string.sessions_form_trainer_me, ownName),
            NewSessionTags.TRAINER_FIXED + ".row",
            NewSessionTags.TRAINER_FIXED,
        )
        return
    }
    var menu by rememberSaveable { mutableStateOf(false) }
    val chosen = state.trainers.firstOrNull { it.id == state.trainerId }
    Box {
        FormRow(
            label,
            chosen?.let { trainerText(it, state.myTrainerId, ownName) }
                ?: stringResource(R.string.sessions_form_trainer_choose, forms.aWord),
            NewSessionTags.TRAINER,
            NewSessionTags.TRAINER_VALUE,
            onClick = { menu = true },
            muted = chosen == null,
        )
        DropdownMenu(
            expanded = menu,
            onDismissRequest = { menu = false },
            modifier = Modifier.testTagsAsIds(),
        ) {
            state.trainers.forEach { trainer ->
                DropdownMenuItem(
                    text = { Text(trainerText(trainer, state.myTrainerId, ownName)) },
                    onClick = {
                        menu = false
                        onTrainer(trainer.id)
                    },
                    modifier = Modifier.testTag("${NewSessionTags.TRAINER}.${trainer.id}"),
                )
            }
        }
    }
}

// The person themself reads *{name} (ik)*.
@Composable
private fun trainerText(trainer: Trainer, myTrainerId: UUID?, ownName: String): String =
    if (trainer.id == myTrainerId) {
        stringResource(R.string.sessions_form_trainer_me, trainer.name.ifEmpty { ownName })
    } else {
        trainer.name
    }

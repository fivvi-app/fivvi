package app.fivvi.pro.classes

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import app.fivvi.api.models.ClassLevel
import app.fivvi.api.models.Trainer
import app.fivvi.core.R
import app.fivvi.core.kit.FieldErrorLine
import app.fivvi.core.kit.FivviCard
import app.fivvi.core.kit.FivviField
import app.fivvi.core.kit.InsetGroupedList
import app.fivvi.core.kit.PillButton
import app.fivvi.core.kit.PillButtonStyle
import app.fivvi.core.ui.testTagsAsIds
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.body
import app.fivvi.designtokens.footnote
import app.fivvi.designtokens.subhead
import app.fivvi.pro.clients.ClientFormBarTags
import app.fivvi.pro.clients.ClientFormFrame
import app.fivvi.pro.sessions.DateDialog
import app.fivvi.pro.sessions.DoubleBookingDialog
import app.fivvi.pro.sessions.FormNote
import app.fivvi.pro.sessions.FormRow
import app.fivvi.pro.sessions.Loading
import app.fivvi.pro.sessions.NewSessionLoad
import app.fivvi.pro.sessions.Notice
import app.fivvi.pro.sessions.SaveFailure
import app.fivvi.pro.sessions.TimeDialog
import app.fivvi.pro.sessions.TimeRefusal
import app.fivvi.pro.sessions.TrainerWordForms
import app.fivvi.pro.sessions.rememberSessionFormat
import app.fivvi.pro.sessions.trainerWordForms
import java.time.LocalDate
import java.time.LocalTime
import java.util.UUID

/** Test tags, shared with the iOS accessibility identifiers and the Maestro flows. */
object NewClassTags {
    const val PREFIX = "newClass"
    const val TITLE = "newClass.title"
    const val CANCEL = "newClass.cancel"
    const val SAVE = "newClass.save"
    const val PENDING = "newClass.pending"
    const val LOADING = "newClass.loading"
    const val LOAD_FAILED = "newClass.loadFailed"
    const val RETRY = "newClass.retry"
    const val OFFLINE = "newClass.offline"
    const val NO_PERMISSION = "newClass.noPermission"
    const val NAME_NL = "newClass.nameNl"
    const val NAME_EN = "newClass.nameEn"
    const val DESCRIPTION_NL = "newClass.descriptionNl"
    const val DESCRIPTION_EN = "newClass.descriptionEn"
    const val DESCRIPTION_NOTE = "newClass.descriptionNote"
    const val NAME_NL_ERROR = "newClass.nameNlError"
    const val NAME_EN_ERROR = "newClass.nameEnError"
    const val DESCRIPTION_NL_ERROR = "newClass.descriptionNlError"
    const val DESCRIPTION_EN_ERROR = "newClass.descriptionEnError"
    const val TRAINER = "newClass.trainer"
    const val TRAINER_VALUE = "newClass.trainerValue"
    const val TRAINER_NEEDED = "newClass.trainer.needed"
    const val LEVEL = "newClass.level"
    const val LEVEL_VALUE = "newClass.levelValue"
    const val LEVEL_NONE = "newClass.level.none"
    const val CAPACITY = "newClass.capacity"
    const val CAPACITY_VALUE = "newClass.capacityValue"
    const val CAPACITY_DOWN = "newClass.capacityDown"
    const val CAPACITY_UP = "newClass.capacityUp"
    const val CAPACITY_ERROR = "newClass.capacityError"
    const val LOCATION = "newClass.location"
    const val DATE = "newClass.date"
    const val DATE_VALUE = "newClass.dateValue"
    const val START = "newClass.start"
    const val START_VALUE = "newClass.startValue"
    const val END = "newClass.end"
    const val END_VALUE = "newClass.endValue"
    const val END_ERROR = "newClass.endError"
    const val TIME_ERROR = "newClass.timeError"
    const val REPEAT = "newClass.repeat"
    const val REPEAT_VALUE = "newClass.repeatValue"
    const val REPEAT_NOTE = "newClass.repeatNote"
    const val REPEAT_NONE = "newClass.repeat.none"
    const val REPEAT_WEEKLY = "newClass.repeat.weekly"
    const val FAILED = "newClass.failed"
    const val DISCARD = "newClass.discard"
    const val KEEP_EDITING = "newClass.keepEditing"
}

/** What TD-05 asks of its host. */
class NewGroupClassActions(
    val onClose: () -> Unit,
    val onSave: () -> Unit,
    /** *Toch opslaan* of PS-07: the same save again, with `allowConflicts`. */
    val onSaveAnyway: () -> Unit,
    /** *Terug* of PS-07. */
    val onDismissDoubleBooking: () -> Unit,
    val onRetry: () -> Unit,
    val onNameNl: (String) -> Unit,
    val onNameEn: (String) -> Unit,
    val onDescriptionNl: (String) -> Unit,
    val onDescriptionEn: (String) -> Unit,
    val onCapacity: (Int) -> Unit,
    /** `null` is *Trainer nodig*. */
    val onTrainer: (UUID?) -> Unit,
    /** *Niveau* (F067); `null` is *Geen*. */
    val onLevel: (ClassLevel?) -> Unit,
    val onDate: (LocalDate) -> Unit,
    val onStart: (LocalTime) -> Unit,
    val onEnd: (LocalTime) -> Unit,
    /** *Herhalen*: `true` is *Elke week op {weekday}*, `false` *Niet herhalen*. */
    val onRepeatsWeekly: (Boolean) -> Unit,
)

/**
 * TD-05 *Nieuwe groepsles* (F021) as a full-screen dialog (`information-architecture.md §5.2`): ✕ and *Opslaan* in the bar
 * and a form in titled sections, as the owner asked (6 November 2026): *Naam en omschrijving* (the names and descriptions in
 * Dutch and English), *De les* (the trainer or *Trainer nodig*, *Niveau* (F067: *Geen* to start with, then *Alle niveaus*,
 * *Beginner*, *Gemiddeld* and *Gevorderd*), the capacity and the location) and *Wanneer* (the date, the
 * start, the end and *Herhalen: Niet herhalen*). Leaving with something entered asks first. Without a connection the form
 * says so and *Opslaan* is off; nothing is queued. [workspaceName] is named when the person has no access.
 */
@Composable
fun NewGroupClassScreen(
    state: NewGroupClassState,
    ownName: String,
    workspaceName: String,
    confirmingDiscard: Boolean,
    onDismissDiscard: () -> Unit,
    onDiscard: () -> Unit,
    actions: NewGroupClassActions,
    modifier: Modifier = Modifier,
) {
    val forms = trainerWordForms(state.workspace.trainerWord)
    ClientFormFrame(
        title = stringResource(R.string.classes_app_new_title),
        tags = ClientFormBarTags(NewClassTags.TITLE, NewClassTags.CANCEL, NewClassTags.SAVE, NewClassTags.PENDING),
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
            NewSessionLoad.Loading -> Loading(NewClassTags.LOADING)

            NewSessionLoad.Failed -> {
                Notice(stringResource(R.string.sessions_form_load_failed), NewClassTags.LOAD_FAILED, error = true)
                PillButton(
                    text = stringResource(R.string.common_retry),
                    onClick = actions.onRetry,
                    modifier = Modifier.testTag(NewClassTags.RETRY),
                )
            }

            NewSessionLoad.Offline -> Unit

            NewSessionLoad.NoPermission -> FivviCard(Modifier.fillMaxWidth().testTag(NewClassTags.NO_PERMISSION)) {
                Text(
                    text = stringResource(R.string.no_permission_body, workspaceName),
                    style = MaterialTheme.typography.body,
                )
            }

            NewSessionLoad.Ready -> Fields(state, ownName, forms, actions)
        }
    }
    if (confirmingDiscard) {
        AlertDialog(
            onDismissRequest = onDismissDiscard,
            modifier = Modifier.testTagsAsIds(),
            confirmButton = {
                TextButton(onClick = onDiscard, modifier = Modifier.testTag(NewClassTags.DISCARD)) {
                    Text(stringResource(R.string.sessions_form_discard))
                }
            },
            dismissButton = {
                TextButton(onClick = onDismissDiscard, modifier = Modifier.testTag(NewClassTags.KEEP_EDITING)) {
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
            NewClassTags.PREFIX,
            actions.onDismissDoubleBooking,
            actions.onSaveAnyway,
        )
    }
}

@Composable
private fun Offline(onRetry: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.space2)) {
        Notice(stringResource(R.string.sessions_form_offline), NewClassTags.OFFLINE, error = false)
        PillButton(
            text = stringResource(R.string.common_retry),
            onClick = onRetry,
            modifier = Modifier.testTag(NewClassTags.RETRY),
        )
    }
}

@Composable
private fun Fields(state: NewGroupClassState, ownName: String, forms: TrainerWordForms, actions: NewGroupClassActions) {
    NameSection(state, actions)
    ClassSection(state, ownName, forms, actions)
    WhenSection(state, actions)
    val failure = when (state.saveFailure) {
        SaveFailure.NoPermission -> stringResource(R.string.classes_form_errors_no_permission)
        SaveFailure.NotSaved -> stringResource(R.string.classes_form_errors_not_saved)
        null -> null
    }
    failure?.let { Notice(it, NewClassTags.FAILED, error = true) }
}

// The title of a group of rows, above it.
@Composable
private fun SectionHeader(text: String) {
    Text(
        text = text,
        modifier = Modifier.padding(start = Spacing.space4).semantics { heading() },
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        style = MaterialTheme.typography.subhead,
    )
}

// The names and the descriptions in Dutch and English, each on a line of its own and as wide as the screen.
@Composable
private fun NameSection(state: NewGroupClassState, actions: NewGroupClassActions) {
    val nameNlError = state.refused[ClassField.NameNl]?.let {
        if (it == TOO_BIG) {
            stringResource(R.string.classes_form_errors_name_too_long, NewGroupClassViewModel.NAME_MAX.toString())
        } else {
            stringResource(R.string.classes_form_errors_name_required)
        }
    }
    val nameEnError = state.refused[ClassField.NameEn]?.let {
        stringResource(R.string.classes_form_errors_name_too_long, NewGroupClassViewModel.NAME_MAX.toString())
    }
    val descriptionTooLong = stringResource(
        R.string.classes_form_errors_description_too_long,
        NewGroupClassViewModel.DESCRIPTION_MAX.toString(),
    )
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.space2)) {
        SectionHeader(stringResource(R.string.classes_form_name_section))
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.space3)) {
            TextField(
                state.nameNl,
                actions.onNameNl,
                stringResource(R.string.classes_form_name_nl_label),
                NewClassTags.NAME_NL,
                nameNlError,
                NewClassTags.NAME_NL_ERROR,
            )
            TextField(
                state.nameEn,
                actions.onNameEn,
                stringResource(R.string.classes_form_name_en_label),
                NewClassTags.NAME_EN,
                nameEnError,
                NewClassTags.NAME_EN_ERROR,
            )
            TextField(
                state.descriptionNl,
                actions.onDescriptionNl,
                stringResource(R.string.classes_form_description_nl_label),
                NewClassTags.DESCRIPTION_NL,
                descriptionTooLong.takeIf { ClassField.DescriptionNl in state.refused },
                NewClassTags.DESCRIPTION_NL_ERROR,
                lines = DESCRIPTION_LINES,
            )
            TextField(
                state.descriptionEn,
                actions.onDescriptionEn,
                stringResource(R.string.classes_form_description_en_label),
                NewClassTags.DESCRIPTION_EN,
                descriptionTooLong.takeIf { ClassField.DescriptionEn in state.refused },
                NewClassTags.DESCRIPTION_EN_ERROR,
                lines = DESCRIPTION_LINES,
            )
        }
        FormNote(stringResource(R.string.classes_app_description_note), NewClassTags.DESCRIPTION_NOTE)
    }
}

// A field of the form: the message of the API's refusal sits under it with a tag of its own.
@Composable
private fun TextField(
    value: String,
    onChange: (String) -> Unit,
    label: String,
    tag: String,
    error: String?,
    errorTag: String,
    lines: IntRange? = null,
) {
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.space2)) {
        FivviField(
            value = value,
            onValueChange = onChange,
            label = label,
            modifier = Modifier.testTag(tag),
            error = error,
            showsErrorMessage = false,
            singleLine = lines == null,
            minLines = lines?.first ?: 1,
            maxLines = lines?.last ?: 1,
        )
        if (error != null) FieldErrorLine(error, Modifier.testTag(errorTag))
    }
}

// The trainer or *Trainer nodig*, the capacity and the location.
@Composable
private fun ClassSection(
    state: NewGroupClassState,
    ownName: String,
    forms: TrainerWordForms,
    actions: NewGroupClassActions,
) {
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.space2)) {
        SectionHeader(stringResource(R.string.classes_form_class_section))
        InsetGroupedList {
            row { TrainerRow(state, ownName, forms, actions.onTrainer) }
            row { LevelRow(state.level, actions.onLevel) }
            row { CapacityRow(state.capacity, actions.onCapacity) }
            row {
                Text(
                    text = stringResource(R.string.classes_schedule_location, state.locationName),
                    modifier = Modifier.fillMaxWidth().testTag(NewClassTags.LOCATION)
                        .padding(horizontal = Spacing.space4, vertical = Spacing.space3),
                    style = MaterialTheme.typography.body,
                )
            }
        }
        if (ClassField.Capacity in state.refused) {
            Box(Modifier.padding(horizontal = Spacing.space4)) {
                FieldErrorLine(
                    stringResource(
                        R.string.classes_form_errors_capacity_invalid,
                        NewGroupClassViewModel.CAPACITIES.last.toString(),
                        NewGroupClassViewModel.CAPACITIES.first.toString(),
                    ),
                    Modifier.testTag(NewClassTags.CAPACITY_ERROR),
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

@Composable
private fun TrainerRow(
    state: NewGroupClassState,
    ownName: String,
    forms: TrainerWordForms,
    onTrainer: (UUID?) -> Unit,
) {
    var menu by rememberSaveable { mutableStateOf(false) }
    val chosen = state.trainers.firstOrNull { it.id == state.trainerId }
    val needed = stringResource(R.string.classes_trainer_needed, forms.wordCap)
    Box {
        FormRow(
            label = stringResource(R.string.classes_date_trainer_label, forms.wordCap),
            value = chosen?.let { trainerText(it, state.myTrainerId, ownName) } ?: needed,
            tag = NewClassTags.TRAINER,
            valueTag = NewClassTags.TRAINER_VALUE,
            onClick = { menu = true },
            muted = chosen == null,
        )
        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }, modifier = Modifier.testTagsAsIds()) {
            DropdownMenuItem(
                text = { Text(needed) },
                onClick = {
                    menu = false
                    onTrainer(null)
                },
                modifier = Modifier.testTag(NewClassTags.TRAINER_NEEDED),
            )
            state.trainers.forEach { trainer ->
                DropdownMenuItem(
                    text = { Text(trainerText(trainer, state.myTrainerId, ownName)) },
                    onClick = {
                        menu = false
                        onTrainer(trainer.id)
                    },
                    modifier = Modifier.testTag("${NewClassTags.TRAINER}.${trainer.id}"),
                )
            }
        }
    }
}

// *Capaciteit* with its value between a minus and a plus, as the iOS stepper.
@Composable
private fun CapacityRow(capacity: Int, onCapacity: (Int) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().defaultMinSize(minHeight = Spacing.space12).testTag(NewClassTags.CAPACITY)
            .padding(start = Spacing.space4, end = Spacing.space2),
        horizontalArrangement = Arrangement.spacedBy(Spacing.space2),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = stringResource(R.string.classes_form_capacity_label),
            modifier = Modifier.weight(1f),
            style = MaterialTheme.typography.body,
        )
        IconButton(
            onClick = { onCapacity(capacity - 1) },
            enabled = capacity > NewGroupClassViewModel.CAPACITIES.first,
            modifier = Modifier.testTag(NewClassTags.CAPACITY_DOWN),
        ) {
            Icon(
                painterResource(R.drawable.ic_remove),
                contentDescription = stringResource(R.string.classes_app_capacity_less),
            )
        }
        Text(
            text = capacity.toString(),
            modifier = Modifier.testTag(NewClassTags.CAPACITY_VALUE),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.body,
            textAlign = TextAlign.Center,
        )
        IconButton(
            onClick = { onCapacity(capacity + 1) },
            enabled = capacity < NewGroupClassViewModel.CAPACITIES.last,
            modifier = Modifier.testTag(NewClassTags.CAPACITY_UP),
        ) {
            Icon(
                painterResource(R.drawable.ic_add),
                contentDescription = stringResource(R.string.classes_app_capacity_more),
            )
        }
    }
}

private enum class Picking { Date, Start, End }

// The date, the start, the end and *Herhalen* (F022): *Niet herhalen* or *Elke week op {weekday}*, with its note.
@Composable
private fun WhenSection(state: NewGroupClassState, actions: NewGroupClassActions) {
    val format = rememberSessionFormat(state.workspace.zone)
    var picking by rememberSaveable { mutableStateOf<Picking?>(null) }
    val time = state.time
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.space2)) {
        SectionHeader(stringResource(R.string.classes_schedule_when_section))
        InsetGroupedList {
            row {
                FormRow(
                    stringResource(R.string.sessions_form_date_label),
                    format.dayYear(time.start.toLocalDate()),
                    NewClassTags.DATE,
                    NewClassTags.DATE_VALUE,
                    onClick = { picking = Picking.Date },
                )
            }
            row {
                FormRow(
                    stringResource(R.string.sessions_form_start_label),
                    clock(time.start.toLocalTime()),
                    NewClassTags.START,
                    NewClassTags.START_VALUE,
                    onClick = { picking = Picking.Start },
                )
            }
            row {
                FormRow(
                    stringResource(R.string.classes_edit_end_label),
                    clock(state.endsAt),
                    NewClassTags.END,
                    NewClassTags.END_VALUE,
                    onClick = { picking = Picking.End },
                )
            }
            row { RepeatRow(state.repeatsWeekly, format.weekday(time.start.toLocalDate()), actions.onRepeatsWeekly) }
        }
        if (state.repeatsWeekly) {
            FormNote(stringResource(R.string.classes_schedule_repeat_note), NewClassTags.REPEAT_NOTE)
        }
        EndError(state)
        time.refusal?.let { refusal ->
            val text = when (refusal) {
                TimeRefusal.InvalidDate -> stringResource(R.string.sessions_form_errors_invalid_date)

                TimeRefusal.InvalidTime -> stringResource(R.string.sessions_form_errors_invalid_time)

                // The API's own words, with the date it names (a weekly class: the first date the clocks skip).
                TimeRefusal.TimeDoesNotExist -> stringResource(
                    R.string.classes_schedule_errors_time_does_not_exist,
                    format.day(state.refusedDate),
                )
            }
            Box(Modifier.padding(horizontal = Spacing.space4)) {
                FieldErrorLine(text, Modifier.testTag(NewClassTags.TIME_ERROR))
            }
        }
    }
    when (picking) {
        Picking.Date -> DateDialog(time.start.toLocalDate(), NewClassTags.PREFIX, { picking = null }) {
            picking = null
            actions.onDate(it)
        }

        Picking.Start -> TimeDialog(time.start.toLocalTime(), NewClassTags.PREFIX, { picking = null }) {
            picking = null
            actions.onStart(it)
        }

        Picking.End -> TimeDialog(state.endsAt, NewClassTags.PREFIX, { picking = null }) {
            picking = null
            actions.onEnd(it)
        }

        null -> Unit
    }
}

// *Herhalen*: the value is *Niet herhalen* or *Elke week op donderdag* (the weekday of the date); a tap offers both.
@Composable
private fun RepeatRow(weekly: Boolean, weekday: String, onChange: (Boolean) -> Unit) {
    var menu by rememberSaveable { mutableStateOf(false) }
    val none = stringResource(R.string.classes_schedule_repeat_none)
    val every = stringResource(R.string.classes_schedule_repeat_weekly, weekday)
    Box {
        FormRow(
            label = stringResource(R.string.classes_schedule_repeat_label),
            value = if (weekly) every else none,
            tag = NewClassTags.REPEAT,
            valueTag = NewClassTags.REPEAT_VALUE,
            onClick = { menu = true },
        )
        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }, modifier = Modifier.testTagsAsIds()) {
            DropdownMenuItem(
                text = { Text(none) },
                onClick = {
                    menu = false
                    onChange(false)
                },
                modifier = Modifier.testTag(NewClassTags.REPEAT_NONE),
            )
            DropdownMenuItem(
                text = { Text(every) },
                onClick = {
                    menu = false
                    onChange(true)
                },
                modifier = Modifier.testTag(NewClassTags.REPEAT_WEEKLY),
            )
        }
    }
}

// A length the API refused: an end that is not after the start, or one outside 15 to 240 minutes in steps of 5.
@Composable
private fun EndError(state: NewGroupClassState) {
    if (ClassField.Duration !in state.refused) return
    val text = if (state.time.durationMinutes <= 0) {
        stringResource(R.string.classes_edit_errors_end_before_start)
    } else {
        // Placeholders in the order of their names: max, min, step.
        stringResource(
            R.string.classes_edit_errors_invalid_duration,
            NewGroupClassViewModel.DURATIONS.last.toString(),
            NewGroupClassViewModel.DURATIONS.first.toString(),
            NewGroupClassViewModel.DURATION_STEP.toString(),
        )
    }
    Box(Modifier.padding(horizontal = Spacing.space4)) {
        FieldErrorLine(text, Modifier.testTag(NewClassTags.END_ERROR))
    }
}

private fun clock(time: LocalTime) = "%02d:%02d".format(time.hour, time.minute)

private const val TOO_BIG = "too_big"
private val DESCRIPTION_LINES = 3..5

package app.fivvi.pro.sessions

import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.indication
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import app.fivvi.core.R
import app.fivvi.core.kit.FieldErrorLine
import app.fivvi.core.kit.InsetGroupedList
import app.fivvi.core.kit.SegmentedChoice
import app.fivvi.core.kit.SegmentedOption
import app.fivvi.core.ui.testTagsAsIds
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.body
import app.fivvi.designtokens.footnote
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.Locale

/** How the screens write a date and a time: in the language shown (English as en-GB) and the workspace's time zone. */
@Composable
fun rememberSessionFormat(zone: ZoneId): SessionFormat {
    val language = LocalConfiguration.current.locales[0].language
    return remember(language, zone) {
        SessionFormat(if (language == "nl") Locale.forLanguageTag("nl-NL") else Locale.UK, zone)
    }
}

/**
 * One line of a form group: [label] at the start, [value] at the end, the whole row a button when [onClick] is given. The
 * row is not merged into one node (a `clickable` would be): the value keeps its own tag, `valueTag`, which the Maestro flows
 * and the iOS twin read the text by.
 */
@Composable
internal fun FormRow(
    label: String,
    value: String,
    tag: String,
    valueTag: String,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    muted: Boolean = false,
) {
    val interaction = remember { MutableInteractionSource() }
    Row(
        modifier = modifier.fillMaxWidth().defaultMinSize(minHeight = Spacing.space12)
            .let { if (onClick != null) it.pressable(interaction, onClick) else it }
            .testTag(tag)
            .padding(horizontal = Spacing.space4, vertical = Spacing.space3),
        horizontalArrangement = Arrangement.spacedBy(Spacing.space4),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text = label, style = MaterialTheme.typography.body)
        Text(
            text = value,
            modifier = Modifier.weight(1f).testTag(valueTag),
            color = if (muted) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
            style = MaterialTheme.typography.body,
            textAlign = TextAlign.End,
        )
    }
}

// A tap with the ripple of a click, and a button's semantics, without `clickable`'s merging of the children.
@Composable
private fun Modifier.pressable(interaction: MutableInteractionSource, action: () -> Unit): Modifier = this
    .indication(interaction, LocalIndication.current)
    .pointerInput(action) {
        detectTapGestures(
            onPress = { offset ->
                val press = PressInteraction.Press(offset)
                interaction.emit(press)
                tryAwaitRelease()
                interaction.emit(PressInteraction.Release(press))
            },
            onTap = { action() },
        )
    }
    .semantics {
        role = Role.Button
        onClick {
            action()
            true
        }
    }

/** A switch with its text: the whole row switches, a screen reader reads one switch. */
@Composable
internal fun SwitchRow(
    text: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    tag: String,
    enabled: Boolean = true,
) {
    Row(
        modifier = Modifier.fillMaxWidth().defaultMinSize(minHeight = Spacing.space12)
            .toggleable(value = checked, enabled = enabled, role = Role.Switch, onValueChange = onCheckedChange)
            .testTag(tag)
            .padding(horizontal = Spacing.space4, vertical = Spacing.space3),
        horizontalArrangement = Arrangement.spacedBy(Spacing.space4),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text = text, modifier = Modifier.weight(1f), style = MaterialTheme.typography.body)
        Switch(checked = checked, onCheckedChange = null, enabled = enabled)
    }
}

/** The text under a group: what the field says more, in the secondary colour. */
@Composable
internal fun FormNote(text: String, tag: String) {
    Text(
        text = text,
        modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.space4).testTag(tag),
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        style = MaterialTheme.typography.footnote,
    )
}

/** What the date, the start and the length of PS-04 and PS-05 ask of their host. */
class SessionTimeActions(
    val onDate: (LocalDate) -> Unit,
    val onStart: (LocalTime) -> Unit,
    val onChooseDuration: (Int) -> Unit,
    val onOtherDuration: (Int) -> Unit,
)

private enum class Picking { Date, Time }

/**
 * The rows PS-04 and PS-05 share: the date and the start (Material 3 pickers, 24 hours), the length (45, 60, 90 or another),
 * where the session ends, and what the API refused about the time. Tags are `<idPrefix>.date`, `.start`, `.duration`,
 * `.durationOther`, `.endsAt` and `.timeError`.
 */
@Composable
internal fun SessionTimeSection(
    time: SessionTime,
    endsAt: SessionClock.End,
    zone: ZoneId,
    dateLabel: String,
    idPrefix: String,
    actions: SessionTimeActions,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val format = rememberSessionFormat(zone)
    var picking by rememberSaveable { mutableStateOf<Picking?>(null) }
    Column(modifier, verticalArrangement = Arrangement.spacedBy(Spacing.space2)) {
        InsetGroupedList {
            row {
                FormRow(
                    dateLabel,
                    format.dayYear(time.start.toLocalDate()),
                    "$idPrefix.date",
                    "$idPrefix.dateValue",
                    onClick = { if (enabled) picking = Picking.Date },
                )
            }
            row {
                FormRow(
                    stringResource(R.string.sessions_form_start_label),
                    "%02d:%02d".format(time.start.hour, time.start.minute),
                    "$idPrefix.start",
                    "$idPrefix.startValue",
                    onClick = { if (enabled) picking = Picking.Time },
                )
            }
            row { Duration(time, idPrefix, actions) }
            row {
                Text(
                    text = stringResource(
                        if (endsAt.nextDay) R.string.sessions_form_ends_at_next_day else R.string.sessions_form_ends_at,
                        endsAt.time,
                    ),
                    modifier = Modifier.fillMaxWidth().testTag("$idPrefix.endsAt")
                        .padding(horizontal = Spacing.space4, vertical = Spacing.space3),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.body,
                )
            }
        }
        time.refusal?.let { refusal ->
            val text = when (refusal) {
                TimeRefusal.InvalidDate -> stringResource(R.string.sessions_form_errors_invalid_date)

                TimeRefusal.InvalidTime -> stringResource(R.string.sessions_form_errors_invalid_time)

                TimeRefusal.TimeDoesNotExist ->
                    stringResource(
                        R.string.sessions_form_errors_time_does_not_exist,
                        format.day(time.start.toLocalDate()),
                    )
            }
            Box(Modifier.padding(horizontal = Spacing.space4)) {
                FieldErrorLine(text, Modifier.testTag("$idPrefix.timeError"))
            }
        }
    }
    when (picking) {
        Picking.Date -> DateDialog(time.start.toLocalDate(), idPrefix, { picking = null }) {
            picking = null
            actions.onDate(it)
        }

        Picking.Time -> TimeDialog(time.start.toLocalTime(), idPrefix, { picking = null }) {
            picking = null
            actions.onStart(it)
        }

        null -> Unit
    }
}

@Composable
private fun Duration(time: SessionTime, idPrefix: String, actions: SessionTimeActions) {
    var menu by rememberSaveable { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().padding(horizontal = Spacing.space4, vertical = Spacing.space3)) {
        Text(
            text = stringResource(R.string.sessions_form_duration_label),
            modifier = Modifier.padding(bottom = Spacing.space2).semantics { heading() },
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.footnote,
        )
        SegmentedChoice(
            options = SessionTime.CHIPS.map { minutes ->
                SegmentedOption(
                    minutes,
                    stringResource(R.string.sessions_form_duration_minutes, minutes.toString()),
                    "$idPrefix.duration.$minutes",
                )
            } + SegmentedOption(
                SessionTime.OTHER,
                stringResource(R.string.sessions_form_duration_other),
                "$idPrefix.duration.other",
            ),
            selected = time.durationChoice,
            onSelect = actions.onChooseDuration,
            modifier = Modifier.testTag("$idPrefix.duration"),
        )
        if (time.otherChosen) {
            Box {
                FormRow(
                    stringResource(R.string.sessions_form_duration_other),
                    stringResource(R.string.sessions_form_duration_minutes, time.durationMinutes.toString()),
                    "$idPrefix.durationOther",
                    "$idPrefix.durationOtherValue",
                    onClick = { menu = true },
                )
                DropdownMenu(
                    expanded = menu,
                    onDismissRequest = { menu = false },
                    modifier = Modifier.testTagsAsIds(),
                ) {
                    SessionTime.OTHER_DURATIONS.forEach { minutes ->
                        DropdownMenuItem(
                            text = {
                                Text(stringResource(R.string.sessions_form_duration_minutes, minutes.toString()))
                            },
                            onClick = {
                                menu = false
                                actions.onOtherDuration(minutes)
                            },
                            modifier = Modifier.testTag("$idPrefix.durationOther.$minutes"),
                        )
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun DateDialog(initial: LocalDate, idPrefix: String, onDismiss: () -> Unit, onPick: (LocalDate) -> Unit) {
    // The picker reads and gives UTC midnights; the date is a plain calendar date of the workspace.
    val state = rememberDatePickerState(
        initialSelectedDateMillis = initial.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
    )
    DatePickerDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(
                onClick = {
                    state.selectedDateMillis?.let {
                        onPick(java.time.Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate())
                    } ?: onDismiss()
                },
                modifier = Modifier.testTag("$idPrefix.pickerDone"),
            ) { Text(stringResource(R.string.sessions_form_picker_done)) }
        },
        modifier = Modifier.testTagsAsIds().testTag("$idPrefix.datePicker"),
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.common_cancel)) }
        },
    ) {
        DatePicker(state)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun TimeDialog(initial: LocalTime, idPrefix: String, onDismiss: () -> Unit, onPick: (LocalTime) -> Unit) {
    val state = rememberTimePickerState(initialHour = initial.hour, initialMinute = initial.minute, is24Hour = true)
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(
                onClick = { onPick(LocalTime.of(state.hour, state.minute)) },
                modifier = Modifier.testTag("$idPrefix.pickerDone"),
            ) { Text(stringResource(R.string.sessions_form_picker_done)) }
        },
        modifier = Modifier.testTagsAsIds().testTag("$idPrefix.timePicker"),
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.common_cancel)) }
        },
        text = { TimePicker(state) },
    )
}

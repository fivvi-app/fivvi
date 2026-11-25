package app.fivvi.pro.classes

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuDefaults
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import app.fivvi.api.models.ClassLevel
import app.fivvi.core.R
import app.fivvi.core.kit.FivviCard
import app.fivvi.core.kit.InsetGroupedList
import app.fivvi.core.kit.LevelIcon
import app.fivvi.core.kit.LevelIconForm
import app.fivvi.core.kit.PillButton
import app.fivvi.core.kit.PillButtonStack
import app.fivvi.core.kit.PillButtonStyle
import app.fivvi.core.kit.ToastHost
import app.fivvi.core.kit.ToastVisuals
import app.fivvi.core.kit.classLevelWord
import app.fivvi.core.ui.testTagsAsIds
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.body
import app.fivvi.designtokens.footnote
import app.fivvi.designtokens.subhead
import app.fivvi.designtokens.title1
import app.fivvi.pro.clients.BackButton
import app.fivvi.pro.sessions.Loading
import app.fivvi.pro.sessions.Notice
import app.fivvi.pro.sessions.SessionFormat
import app.fivvi.pro.sessions.rememberSessionFormat
import app.fivvi.pro.sessions.trainerWordForms
import java.time.ZoneId

/** Test tags, shared with the iOS accessibility identifiers and the Maestro flows. */
object ClassDateTags {
    const val BACK = "classDate.back"
    const val TITLE = "classDate.title"
    const val EYEBROW = "classDate.eyebrow"
    const val LEVEL = "classDate.level"
    const val WHEN = "classDate.when"
    const val ADDED = "classDate.added"
    const val SERIES = "classDate.series"
    const val MANAGE_ON_WEB = "classDate.manageOnWeb"
    const val DESCRIPTION = "classDate.description"
    const val DESCRIPTION_MARK = "classDate.descriptionMark"
    const val DESCRIPTION_TOGGLE = "classDate.descriptionToggle"
    const val LOCATION = "classDate.location"
    const val TRAINER = "classDate.trainer"
    const val BOOKED = "classDate.booked"
    const val NO_BOOKINGS = "classDate.noBookings"
    const val OWNER_NOTE = "classDate.ownerNote"
    const val MENU = "classDate.menu"
    const val EDIT = "classDate.edit"
    const val CANCEL = "classDate.cancel"
    const val CANCELLED = "classDate.cancelled"
    const val CANCEL_FAILED = "classDate.cancelFailed"
    const val CANCEL_OFFLINE = "classDate.cancelOffline"
    const val SHARE_LINK = "classDate.shareLink"
    const val SHARE_LINK_MENU = "classDate.shareLinkMenu"
    const val SHARE_FAILED = "classDate.shareFailed"
    const val SHARE_OFFLINE = "classDate.shareOffline"
    const val CANCEL_SUBMIT = "classDate.cancel.submit"
    const val CANCEL_BACK = "classDate.cancel.back"
    const val CANCEL_BODY = "classDate.cancel.body"
    const val LOADING = "classDate.loading"
    const val ERROR = "classDate.error"
    const val RETRY = "classDate.retry"
    const val NO_PERMISSION_TITLE = "classDate.noPermissionTitle"
    const val NO_PERMISSION = "classDate.noPermission"
}

/** What TD-03 asks of its host. */
class ClassDateActions(
    val onBack: () -> Unit,
    val onRetry: () -> Unit,
    val onToggleDescription: () -> Unit,
    /** *Les wijzigen* of the Owner's ⋯ menu. */
    val onEdit: () -> Unit,
    /** *Les annuleren* of the Owner's ⋯ menu (F026): asks the API who would get the email. */
    val onCancel: () -> Unit = {},
    /** *Les annuleren* of the confirmation. */
    val onConfirmCancel: () -> Unit = {},
    /** *Terug* of the confirmation. */
    val onDismissCancel: () -> Unit = {},
    /** *Boekingslink delen* (F037), the button below the booked card and the first item of the Owner's ⋯ menu. */
    val onShareLink: () -> Unit = {},
)

// Until *Meer*, the description is cut to this many lines.
private const val CUT_LINES = 3

/**
 * TD-03 *Groepsles* (F021): the class's name with the date and time under it, the description cut to a few lines with
 * *Meer* / *Minder*, a group with the location and the trainer (*Trainer nodig* without one), *{booked}/{capacity}
 * geboekt* with *Nog geen boekingen.*, and for the Owner the footnote that editing, a fixed series and the trainers are
 * managed on the web. The Owner's ⋯ menu starts with *Boekingslink delen* (F037, "Boekingslink gekopieerd" in a toast; also a
 * button below the booked card, for the Owner and the Trainers, not on a cancelled or past date), has *Les wijzigen*, which
 * says the same, and below a divider the destructive *Les annuleren* (F026): a native confirmation that says how many
 * booked clients get an email; a Trainer has no menu. A cancelled date shows "Geannuleerd op … door …" and no actions. The sections of later features (participants,
 * attendance) are not shown yet. [workspaceName] is named when the person has no access.
 */
@Composable
fun ClassDateScreen(
    state: ClassDateState,
    workspaceName: String,
    actions: ClassDateActions,
    modifier: Modifier = Modifier,
) {
    val toasts = remember { SnackbarHostState() }
    val copiedText = stringResource(R.string.classes_app_share_link_copied)
    // "Boekingslink gekopieerd" shows each time the link was copied, once: not again when the screen is turned.
    var announced by rememberSaveable { mutableIntStateOf(state.copied) }
    LaunchedEffect(state.copied) {
        if (state.copied > announced) {
            announced = state.copied
            toasts.showSnackbar(ToastVisuals(copiedText))
        }
    }
    Box(modifier.fillMaxSize()) {
        ClassDateContent(state, workspaceName, actions)
        ToastHost(toasts, Modifier.align(Alignment.BottomCenter).safeDrawingPadding().padding(Spacing.space4))
    }
}

@Composable
private fun ClassDateContent(state: ClassDateState, workspaceName: String, actions: ClassDateActions) {
    Column(Modifier.fillMaxSize().safeDrawingPadding()) {
        Row(Modifier.fillMaxWidth().padding(end = Spacing.space2), verticalAlignment = Alignment.CenterVertically) {
            BackButton(ClassDateTags.BACK, actions.onBack)
            Box(Modifier.weight(1f))
            if (state.load == ClassDateLoad.Loaded && state.hasMenu) Menu(state, actions)
        }
        Column(
            modifier = Modifier.fillMaxSize().verticalScroll(
                rememberScrollState(),
            ).padding(horizontal = Spacing.space4),
            verticalArrangement = Arrangement.spacedBy(Spacing.space4),
        ) {
            val session = state.session
            when (state.load) {
                ClassDateLoad.Loading -> {
                    Title(stringResource(R.string.workspace_nav_new_group_class), null, null)
                    Loading(ClassDateTags.LOADING)
                }

                ClassDateLoad.Failed -> {
                    Title(stringResource(R.string.workspace_nav_new_group_class), null, null)
                    Notice(stringResource(R.string.sessions_form_load_failed), ClassDateTags.ERROR, error = true)
                    PillButton(
                        text = stringResource(R.string.common_retry),
                        onClick = actions.onRetry,
                        modifier = Modifier.testTag(ClassDateTags.RETRY),
                    )
                }

                ClassDateLoad.NoPermission -> {
                    Title(stringResource(R.string.workspace_nav_new_group_class), null, null)
                    FivviCard(Modifier.fillMaxWidth()) {
                        Column(verticalArrangement = Arrangement.spacedBy(Spacing.space2)) {
                            Text(
                                text = stringResource(R.string.no_permission_title),
                                modifier = Modifier.testTag(ClassDateTags.NO_PERMISSION_TITLE).semantics { heading() },
                                style = MaterialTheme.typography.title1,
                            )
                            Text(
                                text = stringResource(R.string.no_permission_body, workspaceName),
                                modifier = Modifier.testTag(ClassDateTags.NO_PERMISSION),
                                style = MaterialTheme.typography.body,
                            )
                        }
                    }
                }

                ClassDateLoad.Loaded -> if (session != null) Loaded(session.timeZone, state, actions)
            }
        }
    }
    state.cancelAsk?.let { CancelDialog(it, actions) }
}

// The confirmation of *Les annuleren*: says how many booked clients get an email, or that nobody does.
@Composable
private fun CancelDialog(ask: CancelAsk, actions: ClassDateActions) {
    AlertDialog(
        onDismissRequest = actions.onDismissCancel,
        modifier = Modifier.testTagsAsIds(),
        confirmButton = {
            TextButton(onClick = actions.onConfirmCancel, modifier = Modifier.testTag(ClassDateTags.CANCEL_SUBMIT)) {
                Text(stringResource(R.string.classes_cancel_submit), color = MaterialTheme.colorScheme.error)
            }
        },
        dismissButton = {
            TextButton(onClick = actions.onDismissCancel, modifier = Modifier.testTag(ClassDateTags.CANCEL_BACK)) {
                Text(stringResource(R.string.classes_cancel_back))
            }
        },
        title = { Text(stringResource(R.string.classes_cancel_title)) },
        text = {
            Text(
                when {
                    ask.started -> stringResource(R.string.classes_cancel_started)
                    ask.participants == 0 -> stringResource(R.string.classes_cancel_count_none)
                    else -> pluralStringResource(R.plurals.classes_app_cancel_body, ask.participants, ask.participants)
                },
                modifier = Modifier.testTag(ClassDateTags.CANCEL_BODY),
            )
        },
    )
}

// The eyebrow is the type, with the level after it and the bars beside it (F067): "Groepsles · Gevorderd". With no level
// (*Geen*) it is the type alone, with no separator left over and no icon.
@Composable
private fun Title(eyebrow: String, title: String?, subtitle: String?, level: ClassLevel? = null) {
    val eyebrowText = if (level == null) {
        eyebrow
    } else {
        // Placeholders in the order of their names: level, type.
        stringResource(R.string.classes_date_type_and_level, classLevelWord(level), eyebrow)
    }
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.space1)) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(Spacing.space2),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = eyebrowText,
                // It wraps at a large font scale, so the bars stay on screen beside it.
                modifier = Modifier.weight(1f, fill = false).testTag(ClassDateTags.EYEBROW),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.subhead,
            )
            if (level != null) LevelIcon(level, LevelIconForm.Bars, Modifier.testTag(ClassDateTags.LEVEL))
        }
        Text(
            text = title.orEmpty(),
            modifier = Modifier.fillMaxWidth().testTag(ClassDateTags.TITLE).semantics { heading() },
            style = MaterialTheme.typography.title1,
        )
        subtitle?.let {
            Text(
                text = it,
                modifier = Modifier.fillMaxWidth().testTag(ClassDateTags.WHEN),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.body,
            )
        }
    }
}

@Composable
private fun Loaded(timeZone: String, state: ClassDateState, actions: ClassDateActions) {
    val session = state.session ?: return
    val format = rememberSessionFormat(ZoneId.of(timeZone))
    val english = LocalConfiguration.current.locales[0].language != "nl"
    val forms = trainerWordForms(state.workspace.trainerWord)
    Title(
        stringResource(R.string.workspace_nav_new_group_class),
        state.title(english),
        stringResource(
            R.string.classes_date_time_range,
            format.longDay(session.startsAt),
            format.time(session.endsAt),
            format.time(session.startsAt),
        ),
        state.level,
    )
    state.added?.let { added ->
        val text = if (added > 1) {
            pluralStringResource(R.plurals.classes_schedule_saved_series, added, added)
        } else {
            stringResource(R.string.classes_schedule_saved)
        }
        Message(text, ClassDateTags.ADDED)
    }
    state.seriesLine(english)?.let { line ->
        Text(
            // Placeholders in the order of their names: name, time, weekday.
            text = stringResource(
                R.string.classes_date_series_line,
                line.name,
                line.time,
                format.weekday(line.weekday),
            ),
            modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.space4).testTag(ClassDateTags.SERIES),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.subhead,
        )
    }
    cancelledText(state, format)?.let { Message(it, ClassDateTags.CANCELLED) }
    cancelFailureText(state.cancelFailure)?.let {
        Notice(it, ClassDateTags.CANCEL_FAILED, error = true)
    }
    if (state.isOffline && state.canCancel) {
        Notice(stringResource(R.string.classes_app_cancel_offline), ClassDateTags.CANCEL_OFFLINE, error = false)
    }
    shareFailureText(state.shareFailure)?.let { Notice(it, ClassDateTags.SHARE_FAILED, error = true) }
    if (state.isOffline && state.showsShareLink) {
        Notice(stringResource(R.string.classes_app_share_link_offline), ClassDateTags.SHARE_OFFLINE, error = false)
    }
    if (state.manageOnWeb) Message(stringResource(R.string.classes_app_manage_on_web), ClassDateTags.MANAGE_ON_WEB)
    state.description(english)?.let { Description(it, state.descriptionOpen, actions.onToggleDescription) }
    InsetGroupedList {
        row {
            Text(
                text = session.location.name,
                modifier = Modifier.fillMaxWidth().testTag(ClassDateTags.LOCATION)
                    .padding(horizontal = Spacing.space4, vertical = Spacing.space3),
                style = MaterialTheme.typography.body.copy(fontWeight = FontWeight.SemiBold),
            )
        }
        row {
            Column(
                modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.space4, vertical = Spacing.space3),
                verticalArrangement = Arrangement.spacedBy(Spacing.space0_5),
            ) {
                Text(
                    text = stringResource(R.string.classes_date_trainer_label, forms.wordCap),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.subhead,
                )
                Text(
                    text = when {
                        session.trainer == null -> stringResource(R.string.classes_trainer_needed, forms.wordCap)
                        state.trainerIsMe -> stringResource(R.string.sessions_page_you)
                        else -> session.trainer?.name.orEmpty()
                    },
                    modifier = Modifier.testTag(ClassDateTags.TRAINER),
                    style = MaterialTheme.typography.body.copy(fontWeight = FontWeight.SemiBold),
                )
            }
        }
    }
    FivviCard(Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.space2)) {
            Text(
                text = stringResource(R.string.classes_date_booked_label),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.subhead,
            )
            Text(
                // Placeholders in the order of their names: booked, capacity, free.
                text = pluralStringResource(
                    R.plurals.classes_date_booked,
                    state.free,
                    state.booked.toString(),
                    state.capacity.toString(),
                    state.free,
                ),
                modifier = Modifier.testTag(ClassDateTags.BOOKED),
                style = MaterialTheme.typography.body.copy(fontWeight = FontWeight.SemiBold),
            )
            if (state.showsNoBookings) {
                Text(
                    text = stringResource(R.string.classes_date_no_bookings),
                    modifier = Modifier.testTag(ClassDateTags.NO_BOOKINGS),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.subhead,
                )
            }
        }
    }
    if (state.showsShareLink) {
        PillButtonStack {
            PillButton(
                text = stringResource(R.string.classes_app_share_link),
                onClick = actions.onShareLink,
                modifier = Modifier.testTag(ClassDateTags.SHARE_LINK),
                style = PillButtonStyle.Tonal,
                enabled = state.canTapShareLink,
            )
        }
    }
    if (state.canManage && !state.isCancelled) {
        Text(
            text = stringResource(R.string.classes_app_owner_note, forms.words),
            modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.space4).testTag(ClassDateTags.OWNER_NOTE),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.footnote,
        )
    }
}

// "Geannuleerd op di 20 okt om 10:12 door John", on a cancelled date; `null` otherwise.
@Composable
private fun cancelledText(state: ClassDateState, format: SessionFormat): String? {
    if (!state.isCancelled) return null
    val cancellation = state.session?.cancellation ?: return stringResource(R.string.classes_cancel_already_cancelled)
    val day = format.day(cancellation.cancelledAt)
    val time = format.time(cancellation.cancelledAt)
    // Placeholders in the order of their names: date, name, time.
    return cancellation.cancelledBy?.let {
        stringResource(R.string.classes_date_cancelled_banner, day, it.name, time)
    } ?: stringResource(R.string.classes_date_cancelled_banner_unknown, day, time)
}

@Composable
private fun cancelFailureText(failure: CancelFailure?): String? = when (failure) {
    is CancelFailure.Changed -> failure.byName?.let { stringResource(R.string.classes_cancel_changed_by, it) }
        ?: stringResource(R.string.classes_cancel_changed_by_unknown)

    CancelFailure.Cancelled -> stringResource(R.string.classes_cancel_already_cancelled)

    CancelFailure.NoPermission -> stringResource(R.string.classes_cancel_no_permission)

    CancelFailure.NotSaved -> stringResource(R.string.classes_cancel_not_saved)

    null -> null
}

@Composable
private fun shareFailureText(failure: ShareFailure?): String? = when (failure) {
    ShareFailure.NoPermission -> stringResource(R.string.booking_links_errors_no_permission)
    ShareFailure.NotShared -> stringResource(R.string.booking_links_errors_generic)
    null -> null
}

@Composable
private fun Message(text: String, tag: String) {
    FivviCard(Modifier.fillMaxWidth()) {
        Text(text = text, modifier = Modifier.fillMaxWidth().testTag(tag), style = MaterialTheme.typography.body)
    }
}

// The description in the viewer's language, else Dutch (marked as Dutch), cut to a few lines until *Meer*.
@Composable
private fun Description(description: ClassText, open: Boolean, onToggle: () -> Unit) {
    FivviCard(Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.space2)) {
            if (description.isDutchFallback) {
                Text(
                    text = stringResource(R.string.classes_app_description_in_dutch),
                    modifier = Modifier.testTag(ClassDateTags.DESCRIPTION_MARK),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.footnote.copy(fontWeight = FontWeight.SemiBold),
                )
            }
            Text(
                text = description.text,
                modifier = Modifier.fillMaxWidth().testTag(ClassDateTags.DESCRIPTION),
                maxLines = if (open) Int.MAX_VALUE else CUT_LINES,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.body,
            )
            PillButton(
                text = stringResource(
                    if (open) R.string.classes_app_description_less else R.string.classes_app_description_more,
                ),
                onClick = onToggle,
                modifier = Modifier.testTag(ClassDateTags.DESCRIPTION_TOGGLE),
                style = PillButtonStyle.Text,
            )
        }
    }
}

// The Owner's menu: *Boekingslink delen* (F037, off while offline) first, *Les wijzigen*, which says the class is managed on the web, and below a divider the destructive *Les
// annuleren* (off while offline). F024 adds its items.
@Composable
private fun Menu(state: ClassDateState, actions: ClassDateActions) {
    var open by rememberSaveable { mutableStateOf(false) }
    Box {
        IconButton(onClick = { open = true }, modifier = Modifier.testTag(ClassDateTags.MENU)) {
            Icon(painterResource(R.drawable.ic_more), contentDescription = stringResource(R.string.sessions_page_more))
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }, modifier = Modifier.testTagsAsIds()) {
            if (state.showsShareLinkInMenu) {
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.classes_app_share_link)) },
                    onClick = {
                        open = false
                        actions.onShareLink()
                    },
                    enabled = state.canTapShareLink,
                    modifier = Modifier.testTag(ClassDateTags.SHARE_LINK_MENU),
                )
            }
            DropdownMenuItem(
                text = { Text(stringResource(R.string.classes_app_edit)) },
                onClick = {
                    open = false
                    actions.onEdit()
                },
                modifier = Modifier.testTag(ClassDateTags.EDIT),
            )
            HorizontalDivider()
            DropdownMenuItem(
                text = { Text(stringResource(R.string.classes_cancel_action)) },
                onClick = {
                    open = false
                    actions.onCancel()
                },
                enabled = state.canStartCancel,
                colors = MenuDefaults.itemColors(textColor = MaterialTheme.colorScheme.error),
                modifier = Modifier.testTag(ClassDateTags.CANCEL),
            )
        }
    }
}

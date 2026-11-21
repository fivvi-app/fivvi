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
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
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
import app.fivvi.core.R
import app.fivvi.core.kit.FivviCard
import app.fivvi.core.kit.InsetGroupedList
import app.fivvi.core.kit.PillButton
import app.fivvi.core.kit.PillButtonStyle
import app.fivvi.core.ui.testTagsAsIds
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.body
import app.fivvi.designtokens.footnote
import app.fivvi.designtokens.subhead
import app.fivvi.designtokens.title1
import app.fivvi.pro.clients.BackButton
import app.fivvi.pro.sessions.Loading
import app.fivvi.pro.sessions.Notice
import app.fivvi.pro.sessions.rememberSessionFormat
import app.fivvi.pro.sessions.trainerWordForms
import java.time.ZoneId

/** Test tags, shared with the iOS accessibility identifiers and the Maestro flows. */
object ClassDateTags {
    const val BACK = "classDate.back"
    const val TITLE = "classDate.title"
    const val EYEBROW = "classDate.eyebrow"
    const val WHEN = "classDate.when"
    const val ADDED = "classDate.added"
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
)

// Until *Meer*, the description is cut to this many lines.
private const val CUT_LINES = 3

/**
 * TD-03 *Groepsles* (F021): the class's name with the date and time under it, the description cut to a few lines with
 * *Meer* / *Minder*, a group with the location and the trainer (*Trainer nodig* without one), *{booked}/{capacity}
 * geboekt* with *Nog geen boekingen.*, and for the Owner the footnote that editing, a fixed series and the trainers are
 * managed on the web. The Owner's ⋯ menu has *Les wijzigen*, which says the same; a Trainer has no menu. The sections of
 * later features (participants, attendance, cancelling) are not shown yet. [workspaceName] is named when the person has no
 * access.
 */
@Composable
fun ClassDateScreen(
    state: ClassDateState,
    workspaceName: String,
    actions: ClassDateActions,
    modifier: Modifier = Modifier,
) {
    Column(modifier.fillMaxSize().safeDrawingPadding()) {
        Row(Modifier.fillMaxWidth().padding(end = Spacing.space2), verticalAlignment = Alignment.CenterVertically) {
            BackButton(ClassDateTags.BACK, actions.onBack)
            Box(Modifier.weight(1f))
            if (state.load == ClassDateLoad.Loaded && state.hasMenu) Menu(actions.onEdit)
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
}

@Composable
private fun Title(eyebrow: String, title: String?, subtitle: String?) {
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.space1)) {
        Text(
            text = eyebrow,
            modifier = Modifier.fillMaxWidth().testTag(ClassDateTags.EYEBROW),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.subhead,
        )
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
    )
    if (state.justAdded) Message(stringResource(R.string.classes_schedule_saved), ClassDateTags.ADDED)
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
    if (state.canManage) {
        Text(
            text = stringResource(R.string.classes_app_owner_note, forms.words),
            modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.space4).testTag(ClassDateTags.OWNER_NOTE),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.footnote,
        )
    }
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

// The Owner's menu: *Les wijzigen*, which says the class is managed on the web. F024 and F026 add their items.
@Composable
private fun Menu(onEdit: () -> Unit) {
    var open by rememberSaveable { mutableStateOf(false) }
    Box {
        IconButton(onClick = { open = true }, modifier = Modifier.testTag(ClassDateTags.MENU)) {
            Icon(painterResource(R.drawable.ic_more), contentDescription = stringResource(R.string.sessions_page_more))
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }, modifier = Modifier.testTagsAsIds()) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.classes_app_edit)) },
                onClick = {
                    open = false
                    onEdit()
                },
                modifier = Modifier.testTag(ClassDateTags.EDIT),
            )
        }
    }
}

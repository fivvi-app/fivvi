package app.fivvi.pro.sessions

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
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuDefaults
import androidx.compose.material3.Text
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import app.fivvi.api.models.Session
import app.fivvi.api.models.SessionCancellation
import app.fivvi.core.R
import app.fivvi.core.kit.FivviCard
import app.fivvi.core.kit.InsetGroupedList
import app.fivvi.core.kit.ListRow
import app.fivvi.core.kit.PillButton
import app.fivvi.core.kit.PillButtonStyle
import app.fivvi.core.ui.testTagsAsIds
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.body
import app.fivvi.designtokens.subhead
import app.fivvi.designtokens.title1
import app.fivvi.pro.clients.BackButton
import java.time.ZoneId
import java.util.UUID

/** Test tags, shared with the iOS accessibility identifiers and the Maestro flows. */
object SessionTags {
    const val BACK = "session.back"
    const val TITLE = "session.title"
    const val WHEN = "session.when"
    const val MENU = "session.menu"
    const val RESCHEDULE = "session.reschedule"
    const val CLIENT_PROFILE = "session.clientProfile"
    const val LOADING = "session.loading"
    const val ERROR = "session.error"
    const val RETRY = "session.retry"
    const val NO_PERMISSION = "session.noPermission"
    const val CANCELLED = "session.cancelled"
    const val CANCEL = "session.cancel"
    const val CANCEL_DONE = "session.cancelDone"
    const val CANCEL_OFFLINE = "session.cancelOffline"
    const val MOVED = "session.moved"
    const val LOCATION = "session.location"
    const val ROUTE = "session.route"
    const val WORKSPACE = "session.workspace"
    const val TRAINER = "session.trainer"
    const val CLIENT = "session.client"
}

/** What TD-02 asks of its host. */
class SessionActions(
    val onBack: () -> Unit,
    val onRetry: () -> Unit,
    /** `null` when the person may not plan sessions: *Verplaatsen* is not shown. */
    val onReschedule: (() -> Unit)?,
    val onOpenClient: (UUID) -> Unit,
    /** Opens the route to the location in the maps app, with the URL it is given. */
    val onRoute: (String) -> Unit,
    /** *Annuleren* of the ⋯ menu (PS-06, F026): shown while the person may cancel the session. */
    val onCancel: () -> Unit = {},
)

/**
 * TD-02 *Privésessie* (F020): the title *Privésessie met Anna* with the date and time under it, a group with the location
 * and its *Route* button (which opens the maps app with the address) and the workspace with the trainer, and the client.
 * The ⋯ menu has *Verplaatsen* (PS-05, for whoever may plan sessions, not for a cancelled session), *Klantprofiel* and,
 * below a divider, the destructive *Annuleren* (PS-06, F026: the Owner for any session, a Trainer for their own; off
 * while offline). A cancelled session shows "Geannuleerd op … door …" and offers *Klantprofiel* only. The sections of
 * later features (workout, last time, notes, attendance) are not shown yet.
 */
@Composable
fun SessionScreen(state: SessionState, workspaceName: String, actions: SessionActions, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxSize().safeDrawingPadding()) {
        val session = state.session
        Row(Modifier.fillMaxWidth().padding(end = Spacing.space2), verticalAlignment = Alignment.CenterVertically) {
            BackButton(SessionTags.BACK, actions.onBack)
            Box(Modifier.weight(1f))
            if (session != null && state.client != null) Menu(state, actions)
        }
        Column(
            modifier = Modifier.fillMaxSize().verticalScroll(
                rememberScrollState(),
            ).padding(horizontal = Spacing.space4),
            verticalArrangement = Arrangement.spacedBy(Spacing.space4),
        ) {
            when (state.load) {
                SessionLoad.Loading -> {
                    Title(stringResource(R.string.sessions_title), null)
                    Loading(SessionTags.LOADING)
                }

                SessionLoad.Failed -> {
                    Title(stringResource(R.string.sessions_title), null)
                    Text(
                        text = stringResource(R.string.sessions_form_load_failed),
                        modifier = Modifier.fillMaxWidth().testTag(SessionTags.ERROR),
                        style = MaterialTheme.typography.body,
                    )
                    PillButton(
                        text = stringResource(R.string.common_retry),
                        onClick = actions.onRetry,
                        modifier = Modifier.testTag(SessionTags.RETRY),
                    )
                }

                SessionLoad.NoPermission -> {
                    Title(stringResource(R.string.sessions_title), null)
                    FivviCard(Modifier.fillMaxWidth().testTag(SessionTags.NO_PERMISSION)) {
                        Column(verticalArrangement = Arrangement.spacedBy(Spacing.space2)) {
                            Text(
                                text = stringResource(R.string.no_permission_title),
                                modifier = Modifier.semantics { heading() },
                                style = MaterialTheme.typography.title1,
                            )
                            Text(
                                text = stringResource(R.string.no_permission_body, workspaceName),
                                style = MaterialTheme.typography.body,
                            )
                        }
                    }
                }

                SessionLoad.Loaded -> if (session != null) Loaded(session, state, workspaceName, actions)
            }
        }
    }
}

@Composable
private fun Title(title: String, subtitle: String?) {
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.space1)) {
        Text(
            text = title,
            modifier = Modifier.fillMaxWidth().testTag(SessionTags.TITLE).semantics { heading() },
            style = MaterialTheme.typography.title1,
        )
        subtitle?.let {
            Text(
                text = it,
                modifier = Modifier.fillMaxWidth().testTag(SessionTags.WHEN),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.body,
            )
        }
    }
}

@Composable
private fun Loaded(session: Session, state: SessionState, workspaceName: String, actions: SessionActions) {
    val zone = ZoneId.of(session.timeZone)
    val format = rememberSessionFormat(zone)
    val client = state.client
    Title(
        stringResource(R.string.sessions_page_heading, client?.name.orEmpty()),
        stringResource(
            R.string.sessions_page_time_range,
            format.longDay(session.startsAt),
            format.time(session.endsAt),
            format.time(session.startsAt),
        ),
    )
    if (state.justCancelled) Message(stringResource(R.string.sessions_cancel_done), SessionTags.CANCEL_DONE)
    if (state.isCancelled) Message(cancelledText(session, format), SessionTags.CANCELLED)
    if (state.isOffline && state.canCancel) {
        Message(stringResource(R.string.sessions_cancel_offline), SessionTags.CANCEL_OFFLINE)
    }
    state.moved?.let {
        Message(
            stringResource(R.string.sessions_page_moved, format.day(it.startsAt), format.time(it.startsAt)),
            SessionTags.MOVED,
        )
    }
    InsetGroupedList {
        row { LocationRow(session, state.routeUrl, actions.onRoute) }
        row { WorkspaceRow(workspaceName, trainerText(state)) }
    }
    if (client != null) {
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.space2)) {
            Text(
                text = stringResource(R.string.sessions_page_client_label),
                modifier = Modifier.padding(start = Spacing.space4).semantics { heading() },
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.subhead,
            )
            InsetGroupedList {
                row {
                    ListRow(
                        title = client.name,
                        modifier = Modifier.testTag(SessionTags.CLIENT),
                        onClick = { actions.onOpenClient(client.clientId) },
                        chevron = true,
                    )
                }
            }
        }
    }
}

// "Geannuleerd op do 24 sep om 10:12 door Sarah · op verzoek van de klant"; the plain line when the API sent no record of the
// cancellation.
@Composable
private fun cancelledText(session: Session, format: SessionFormat): String {
    val cancellation = session.cancellation ?: return stringResource(R.string.sessions_page_cancelled)
    val day = format.day(cancellation.cancelledAt)
    val time = format.time(cancellation.cancelledAt)
    // Placeholders in the order of their names: date, name, time.
    val banner = cancellation.cancelledBy?.let {
        stringResource(R.string.sessions_page_cancelled_banner, day, it.name, time)
    } ?: stringResource(R.string.sessions_page_cancelled_banner_unknown, day, time)
    return if (cancellation.initiator == SessionCancellation.Initiator.CLIENT) {
        "$banner · ${stringResource(R.string.sessions_page_cancelled_by_client)}"
    } else {
        banner
    }
}

@Composable
private fun Message(text: String, tag: String) {
    FivviCard(Modifier.fillMaxWidth()) {
        Text(text = text, modifier = Modifier.fillMaxWidth().testTag(tag), style = MaterialTheme.typography.body)
    }
}

// *Jij* for the person looking, else the name, or *Geen trainer* once the trainer's profile ended.
@Composable
private fun trainerText(state: SessionState): String {
    val trainer = state.session?.trainer
    return when {
        trainer == null -> stringResource(
            R.string.sessions_page_no_trainer,
            trainerWordForms(state.workspace.trainerWord).word,
        )

        state.trainerIsMe -> stringResource(R.string.sessions_page_you)

        else -> trainer.name
    }
}

// The place, with *Route* when the location has an address.
@Composable
private fun LocationRow(session: Session, routeUrl: String?, onRoute: (String) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.space4, vertical = Spacing.space2),
        horizontalArrangement = Arrangement.spacedBy(Spacing.space3),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = session.location.name,
            modifier = Modifier.weight(1f).testTag(SessionTags.LOCATION),
            style = MaterialTheme.typography.body.copy(fontWeight = FontWeight.SemiBold),
        )
        if (routeUrl != null) {
            PillButton(
                text = stringResource(R.string.sessions_page_route),
                onClick = { onRoute(routeUrl) },
                modifier = Modifier.testTag(SessionTags.ROUTE),
                style = PillButtonStyle.Text,
            )
        }
    }
}

// The workspace, with the trainer under it.
@Composable
private fun WorkspaceRow(workspaceName: String, trainer: String) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.space4, vertical = Spacing.space3),
        verticalArrangement = Arrangement.spacedBy(Spacing.space0_5),
    ) {
        Text(
            text = workspaceName,
            modifier = Modifier.testTag(SessionTags.WORKSPACE),
            style = MaterialTheme.typography.body.copy(fontWeight = FontWeight.SemiBold),
        )
        Text(
            text = trainer,
            modifier = Modifier.testTag(SessionTags.TRAINER),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.subhead,
            textAlign = TextAlign.Start,
        )
    }
}

@Composable
private fun Menu(state: SessionState, actions: SessionActions) {
    var open by rememberSaveable { mutableStateOf(false) }
    val client = state.client ?: return
    Box {
        IconButton(onClick = { open = true }, modifier = Modifier.testTag(SessionTags.MENU)) {
            Icon(painterResource(R.drawable.ic_more), contentDescription = stringResource(R.string.sessions_page_more))
        }
        DropdownMenu(
            expanded = open,
            onDismissRequest = { open = false },
            modifier = Modifier.testTagsAsIds(),
        ) {
            actions.onReschedule?.let { reschedule ->
                if (!state.isCancelled) {
                    DropdownMenuItem(
                        text = { Text(stringResource(R.string.sessions_page_reschedule)) },
                        onClick = {
                            open = false
                            reschedule()
                        },
                        modifier = Modifier.testTag(SessionTags.RESCHEDULE),
                    )
                }
            }
            DropdownMenuItem(
                text = { Text(stringResource(R.string.sessions_page_client_profile)) },
                onClick = {
                    open = false
                    actions.onOpenClient(client.clientId)
                },
                modifier = Modifier.testTag(SessionTags.CLIENT_PROFILE),
            )
            if (state.canCancel) {
                HorizontalDivider()
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.sessions_cancel_action)) },
                    onClick = {
                        open = false
                        actions.onCancel()
                    },
                    enabled = !state.isOffline,
                    colors = MenuDefaults.itemColors(textColor = MaterialTheme.colorScheme.error),
                    modifier = Modifier.testTag(SessionTags.CANCEL),
                )
            }
        }
    }
}

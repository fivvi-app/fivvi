package app.fivvi.pro.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import app.fivvi.core.R
import app.fivvi.core.kit.FivviCard
import app.fivvi.core.kit.InsetGroupedList
import app.fivvi.core.kit.ListRow
import app.fivvi.core.kit.PillButton
import app.fivvi.core.kit.PillButtonStack
import app.fivvi.core.kit.PillButtonStyle
import app.fivvi.core.kit.RoundControl
import app.fivvi.core.ui.testTagsAsIds
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.body
import app.fivvi.designtokens.title1
import app.fivvi.designtokens.title2

/** Test tags, shared with the iOS accessibility identifiers and the Maestro flows. */
object HomeTags {
    const val SIGNED_IN_AS = "home.signedInAs"
    const val LOADING = "home.loading"
    const val ERROR = "home.error"
    const val RETRY = "home.retry"
    const val SIGN_OUT = "home.signOut"
    const val SIGNING_OUT = "home.signingOut"
    const val WORKSPACE_NAME = "home.workspaceName"
    const val SET_UP_ON_WEB = "home.setUpOnWeb"
    const val OPEN_WEB = "home.openWeb"
    const val NO_ACCESS = "home.noAccess"

    /** The line under the no-access text that points a client who opened Fivvi Pro by mistake to the Fivvi app (F030). */
    const val NO_ACCESS_CLIENT_HINT = "home.noAccessClientHint"
    const val OPEN_PROFILE = "home.openProfile"
    const val OPEN_CLIENTS = "home.openClients"

    /** The **+** and its menu's *Privésessie* (F020). */
    const val NEW = "home.new"
    const val NEW_PRIVATE_SESSION = "home.newPrivateSession"

    /** The menu's *Groepsles* (F021), and the line that takes its place for a team member who may not plan classes. */
    const val NEW_GROUP_CLASS = "home.newGroupClass"
    const val NEW_GROUP_CLASS_NOTE = "home.newGroupClassNote"
}

/**
 * The signed-in home (a placeholder, in the look of *Vandaag (TD-01)*'s large title and grouped list): the workspace's
 * name, the address of the signed-in account, the rows to Klanten and Profiel and the sign-out button, which a progress
 * indicator replaces while [signingOut]. [onOpenClients] is `null` where the person may not see clients. The **+** at the top
 * has *Privésessie* (PS-04, F020) while [onNewPrivateSession] is given: the person plans private sessions in the workspace;
 * *Groepsles* (TD-05, F021) while [onNewGroupClass] is given: the person has `class.manage`. Without it, and with
 * [groupClassNoteWorkspace] (the workspace's name), the menu says that the owner plans the group classes there instead.
 */
@Composable
fun HomeScreen(
    me: MeState,
    signingOut: Boolean,
    onRetryMe: () -> Unit,
    onSignOut: () -> Unit,
    onOpenWeb: () -> Unit,
    onOpenProfile: () -> Unit,
    modifier: Modifier = Modifier,
    onOpenClients: (() -> Unit)? = null,
    onNewPrivateSession: (() -> Unit)? = null,
    onNewGroupClass: (() -> Unit)? = null,
    groupClassNoteWorkspace: String? = null,
) {
    // One scroll for the whole screen, so the account block can't squeeze what is above it at the largest font scale.
    Column(
        modifier = modifier.fillMaxSize().safeDrawingPadding().verticalScroll(rememberScrollState())
            .padding(Spacing.space4),
        verticalArrangement = Arrangement.spacedBy(Spacing.space4),
    ) {
        if ((onNewPrivateSession != null || onNewGroupClass != null) && me is MeState.Loaded) {
            NewMenu(onNewPrivateSession, onNewGroupClass, groupClassNoteWorkspace)
        }
        Destination(me, onOpenWeb)
        when (me) {
            MeState.Loading -> {
                val label = stringResource(R.string.common_loading)
                CircularProgressIndicator(
                    Modifier.align(Alignment.CenterHorizontally).testTag(HomeTags.LOADING).semantics {
                        contentDescription = label
                    },
                )
            }

            is MeState.Loaded -> Text(
                text = stringResource(R.string.home_signed_in_as, me.email),
                modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.space1).testTag(HomeTags.SIGNED_IN_AS),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.body,
            )

            MeState.Failed -> {
                Text(
                    text = stringResource(R.string.sign_in_errors_generic),
                    modifier = Modifier.fillMaxWidth().testTag(HomeTags.ERROR),
                    style = MaterialTheme.typography.body,
                )
                PillButtonStack {
                    PillButton(
                        text = stringResource(R.string.common_retry),
                        onClick = onRetryMe,
                        modifier = Modifier.testTag(HomeTags.RETRY),
                    )
                }
            }
        }
        // Klanten (TM-02) is reached from here when the capability helper lists `clients.view` for the workspace shown, and
        // Profiel (TM-04) once the account has answered (it lists the workspaces, whatever the home shows).
        if (me is MeState.Loaded) {
            InsetGroupedList {
                if (onOpenClients != null) {
                    row {
                        ListRow(
                            title = stringResource(R.string.clients_title),
                            modifier = Modifier.testTag(HomeTags.OPEN_CLIENTS),
                            onClick = onOpenClients,
                            chevron = true,
                        )
                    }
                }
                row {
                    ListRow(
                        title = stringResource(R.string.profile_title),
                        modifier = Modifier.testTag(HomeTags.OPEN_PROFILE),
                        onClick = onOpenProfile,
                        chevron = true,
                    )
                }
            }
        }
        SignOut(signingOut, onSignOut)
    }
}

/**
 * **+** (the prototype's round control), with *Privésessie* and *Groepsles*, or the line that the owner plans the classes: at
 * the top of the home and of Vandaag (F013). It has what the callbacks give; none given, it has nothing. [enabled] is off while
 * the phone is offline on Vandaag (creating needs the server), with [disabledReason] as its state for TalkBack.
 */
@Composable
fun NewMenu(
    onNewPrivateSession: (() -> Unit)?,
    onNewGroupClass: (() -> Unit)?,
    noteWorkspace: String?,
    modifier: Modifier = Modifier.fillMaxWidth(),
    enabled: Boolean = true,
    disabledReason: String? = null,
) {
    var open by rememberSaveable { mutableStateOf(false) }
    Box(modifier, contentAlignment = Alignment.CenterEnd) {
        RoundControl(
            icon = painterResource(R.drawable.ic_add),
            contentDescription = stringResource(R.string.workspace_nav_new),
            onClick = { open = true },
            modifier = Modifier.testTag(HomeTags.NEW).semantics {
                if (!enabled && disabledReason != null) stateDescription = disabledReason
            },
            enabled = enabled,
        )
        DropdownMenu(
            expanded = open,
            onDismissRequest = { open = false },
            modifier = Modifier.testTagsAsIds(),
        ) {
            if (onNewPrivateSession != null) {
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.workspace_nav_new_private_session)) },
                    onClick = {
                        open = false
                        onNewPrivateSession()
                    },
                    modifier = Modifier.testTag(HomeTags.NEW_PRIVATE_SESSION),
                )
            }
            if (onNewGroupClass != null) {
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.workspace_nav_new_group_class)) },
                    onClick = {
                        open = false
                        onNewGroupClass()
                    },
                    modifier = Modifier.testTag(HomeTags.NEW_GROUP_CLASS),
                )
            }
            if (onNewGroupClass == null && noteWorkspace != null) {
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.workspace_nav_new_group_class_note, noteWorkspace)) },
                    onClick = {},
                    enabled = false,
                    modifier = Modifier.testTag(HomeTags.NEW_GROUP_CLASS_NOTE),
                )
            }
        }
    }
}

// The part above the account block: what the API said the person gets (F002 AC10): the workspace's name, the text to set
// one up on the web, or the no-access text. Loading or failed, /me has not said, so there is nothing above it.
@Composable
private fun Destination(me: MeState, onOpenWeb: () -> Unit) {
    when (val destination = (me as? MeState.Loaded)?.destination) {
        null -> Unit

        is HomeDestination.Workspace -> {
            Text(
                text = destination.name,
                modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.space1).testTag(HomeTags.WORKSPACE_NAME)
                    .semantics { heading() },
                style = MaterialTheme.typography.title1,
            )
        }

        HomeDestination.SetUpOnWeb -> FivviCard(Modifier.fillMaxWidth()) {
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.space4)) {
                Text(
                    text = stringResource(R.string.home_set_up_on_web),
                    modifier = Modifier.fillMaxWidth().testTag(HomeTags.SET_UP_ON_WEB),
                    style = MaterialTheme.typography.title2,
                )
                PillButtonStack {
                    PillButton(
                        text = stringResource(R.string.home_open_web),
                        onClick = onOpenWeb,
                        modifier = Modifier.testTag(HomeTags.OPEN_WEB),
                    )
                }
            }
        }

        HomeDestination.NoAccess -> FivviCard(Modifier.fillMaxWidth().testTag(HomeTags.NO_ACCESS)) {
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.space2)) {
                Text(
                    text = stringResource(R.string.no_access_title),
                    modifier = Modifier.semantics { heading() },
                    style = MaterialTheme.typography.title2,
                )
                Text(text = stringResource(R.string.no_access_body), style = MaterialTheme.typography.body)
                Text(
                    text = stringResource(R.string.no_access_client_hint),
                    modifier = Modifier.padding(top = Spacing.space2).testTag(HomeTags.NO_ACCESS_CLIENT_HINT),
                    style = MaterialTheme.typography.body,
                )
            }
        }
    }
}

@Composable
private fun SignOut(signingOut: Boolean, onSignOut: () -> Unit) {
    if (signingOut) {
        val label = stringResource(R.string.common_loading)
        CircularProgressIndicator(
            Modifier.testTag(HomeTags.SIGNING_OUT).semantics {
                contentDescription = label
                liveRegion = LiveRegionMode.Polite
            },
        )
    } else {
        PillButtonStack {
            PillButton(
                text = stringResource(R.string.sign_out_label),
                onClick = onSignOut,
                modifier = Modifier.testTag(HomeTags.SIGN_OUT),
                style = PillButtonStyle.Tonal,
            )
        }
    }
}

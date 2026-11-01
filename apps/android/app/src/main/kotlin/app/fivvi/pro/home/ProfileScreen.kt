package app.fivvi.pro.home

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.body
import app.fivvi.designtokens.subhead
import app.fivvi.designtokens.title1
import app.fivvi.designtokens.title2
import app.fivvi.pro.AppLanguage
import app.fivvi.pro.LanguageList
import app.fivvi.pro.R
import java.util.UUID

/** Test tags, shared with the iOS accessibility identifiers and the Maestro flows. */
object ProfileTags {
    const val TITLE = "profile.title"
    const val WORKSPACES_TITLE = "profile.workspacesTitle"
    const val LOADING = "profile.loading"
    const val ERROR = "profile.error"
    const val RETRY = "profile.retry"

    /** Your details: the section title, the name (a button: tapping it opens the name dialog), the email address, the confirmation. */
    const val DETAILS_TITLE = "profile.detailsTitle"
    const val NAME = "profile.name"
    const val EMAIL = "profile.email"
    const val NAME_SAVED = "profile.nameSaved"

    /** The name dialog: its title, the field, *Opslaan*, *Annuleren* and the field message. */
    const val NAME_EDITOR = "profile.nameEditor"
    const val NAME_INPUT = "profile.nameInput"
    const val NAME_SAVE = "profile.nameSave"
    const val NAME_CANCEL = "profile.nameCancel"
    const val NAME_ERROR = "profile.nameError"

    /**
     * The Owner's switch *I also train at …*: `profile.trainsHere.<slug>` (checked when they train there; a Trainer's workspace
     * has none), with `profile.trainsHereSaved.<slug>` and `profile.trainsHereError.<slug>` for the line under it.
     */
    const val TRAINS_HERE = "profile.trainsHere"
    const val TRAINS_HERE_SAVED = "profile.trainsHereSaved"
    const val TRAINS_HERE_ERROR = "profile.trainsHereError"

    /** The language section: `profile.language` is its title, `profile.language.nl-NL` and `.en` the options. */
    const val LANGUAGE = "profile.language"
    const val LANGUAGE_ERROR = "profile.language.error"

    /** Row tags end in the workspace's slug: `profile.workspaceName.<slug>` and `profile.workspaceRole.<slug>`. */
    const val WORKSPACE_NAME = "profile.workspaceName"
    const val WORKSPACE_ROLE = "profile.workspaceRole"
}

/** What the person can do on *Profiel*; the view model answers each. */
class ProfileActions(
    val onRetry: () -> Unit,
    val onEditName: () -> Unit,
    val onNameInput: (String) -> Unit,
    val onSaveName: () -> Unit,
    val onCancelName: () -> Unit,
    val onSetTrainsHere: (UUID, Boolean) -> Unit,
    val language: AppLanguage,
    val languageSaveFailed: Boolean,
    val onChooseLanguage: (AppLanguage) -> Unit,
)

/**
 * *Profiel* / *Profile* (TM-04): the section *Jouw gegevens* / *Your details* has the name, which opens the full-screen
 * dialog [NameEditorScreen] when tapped, and the email address (read-only, F005); the section *Mijn werkruimtes* /
 * *My workspaces* lists each workspace with the role label of the account on its team and, for an account that may manage the team (an Owner), the switch
 * *Ik geef zelf ook trainingen in …* (F003 AC9, F005 AC4, AC5). Back is the system's back (it closes the dialog first, and does nothing while a save is under way).
 * No switching of workspaces (F012); F010 adds *Taal* (the language list, saved on the account).
 */
@Composable
fun ProfileScreen(state: ProfileState, editor: NameEditor?, actions: ProfileActions, modifier: Modifier = Modifier) {
    // While a switch is being saved back does nothing: leaving would hide how it went. The handler enters the composition
    // then (a later handler wins over the one that leaves Profiel; toggling `enabled` would keep the older order).
    val savingSwitch = state is ProfileState.Loaded && state.workspaces.any { it.change == TrainsHereChange.Saving }
    if (savingSwitch) BackHandler {}
    if (editor != null) {
        // While the name is being saved back does nothing either; otherwise it closes the dialog.
        BackHandler { if (!editor.saving) actions.onCancelName() }
        NameEditorScreen(editor, actions, modifier)
        return
    }
    Column(
        modifier = modifier.fillMaxSize().safeDrawingPadding().verticalScroll(rememberScrollState())
            .padding(Spacing.space6),
        verticalArrangement = Arrangement.spacedBy(Spacing.space4),
    ) {
        Text(
            text = stringResource(R.string.my_profile_title),
            modifier = Modifier.testTag(ProfileTags.TITLE).semantics { heading() },
            style = MaterialTheme.typography.title1,
        )
        if (state is ProfileState.Loaded) Details(state, actions.onEditName)
        Text(
            text = stringResource(R.string.my_profile_workspaces_title),
            modifier = Modifier.testTag(ProfileTags.WORKSPACES_TITLE).semantics { heading() },
            style = MaterialTheme.typography.title2,
        )
        when (state) {
            ProfileState.Loading -> {
                val label = stringResource(R.string.common_loading)
                CircularProgressIndicator(
                    Modifier.align(Alignment.CenterHorizontally).testTag(ProfileTags.LOADING)
                        .semantics { contentDescription = label },
                )
            }

            is ProfileState.Loaded -> state.workspaces.forEach { Workspace(it, actions.onSetTrainsHere) }

            ProfileState.Failed -> {
                Text(
                    text = stringResource(R.string.sign_in_errors_generic),
                    modifier = Modifier.testTag(ProfileTags.ERROR),
                    style = MaterialTheme.typography.body,
                )
                Button(onClick = actions.onRetry, modifier = Modifier.testTag(ProfileTags.RETRY)) {
                    Text(stringResource(R.string.common_retry))
                }
            }
        }
        Text(
            text = stringResource(R.string.profile_language),
            modifier = Modifier.testTag(ProfileTags.LANGUAGE).semantics { heading() },
            style = MaterialTheme.typography.title2,
        )
        LanguageList(ProfileTags.LANGUAGE, actions.language, actions.onChooseLanguage)
        if (actions.languageSaveFailed) {
            Text(
                text = stringResource(R.string.user_menu_error),
                modifier = Modifier.testTag(ProfileTags.LANGUAGE_ERROR),
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.body,
            )
        }
    }
}

// The name (tap to change it) and the email address, which is read-only: changing it is out of scope (F001).
@Composable
private fun Details(state: ProfileState.Loaded, onEditName: () -> Unit) {
    Text(
        text = stringResource(R.string.my_profile_details_title),
        modifier = Modifier.testTag(ProfileTags.DETAILS_TITLE).semantics { heading() },
        style = MaterialTheme.typography.title2,
    )
    val editName = stringResource(R.string.my_profile_edit_name)
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.space1)) {
        Text(text = stringResource(R.string.my_profile_name_label), style = MaterialTheme.typography.subhead)
        // The name itself is the button, so the node that opens the dialog carries both the tag and the name as its text (a
        // Material button keeps its text on a child, and Maestro matches an id and a text on one node); without a name it
        // offers the change.
        Text(
            text = state.name ?: editName,
            modifier = Modifier
                .heightIn(min = Spacing.space12)
                .testTag(ProfileTags.NAME)
                .clickable(onClickLabel = editName, role = Role.Button, onClick = onEditName)
                .wrapContentHeight(Alignment.CenterVertically),
            color = MaterialTheme.colorScheme.primary,
            style = MaterialTheme.typography.body,
        )
        if (state.nameSaved) {
            Text(
                text = stringResource(R.string.my_profile_saved),
                modifier = Modifier.testTag(ProfileTags.NAME_SAVED).semantics { liveRegion = LiveRegionMode.Polite },
                style = MaterialTheme.typography.body,
            )
        }
    }
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.space1)) {
        Text(text = stringResource(R.string.my_profile_email_label), style = MaterialTheme.typography.subhead)
        Text(
            text = state.email,
            modifier = Modifier.testTag(ProfileTags.EMAIL),
            style = MaterialTheme.typography.body,
        )
    }
}

@Composable
private fun Workspace(workspace: ProfileWorkspace, onSetTrainsHere: (UUID, Boolean) -> Unit) {
    val role = stringResource(
        when (workspace.role) {
            ProfileRole.Owner -> R.string.roles_owner
            ProfileRole.Trainer -> R.string.roles_trainer
        },
    )
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(Spacing.space1),
    ) {
        Text(
            text = workspace.name,
            modifier = Modifier.testTag("${ProfileTags.WORKSPACE_NAME}.${workspace.slug}"),
            style = MaterialTheme.typography.body,
        )
        Text(
            text = role,
            modifier = Modifier.testTag("${ProfileTags.WORKSPACE_ROLE}.${workspace.slug}"),
            style = MaterialTheme.typography.body,
        )
        if (workspace.canSwitchTrainsHere) TrainsHere(workspace, onSetTrainsHere)
    }
}

// *Ik geef zelf ook trainingen in …*: the whole row is the switch. It shows what the API accepted and waits while saving.
@Composable
private fun TrainsHere(workspace: ProfileWorkspace, onSetTrainsHere: (UUID, Boolean) -> Unit) {
    val saving = workspace.change == TrainsHereChange.Saving
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = Spacing.space12)
            .testTag("${ProfileTags.TRAINS_HERE}.${workspace.slug}")
            .toggleable(
                value = workspace.trainsHere,
                enabled = !saving,
                role = Role.Switch,
                onValueChange = { onSetTrainsHere(workspace.id, it) },
            ),
        horizontalArrangement = Arrangement.spacedBy(Spacing.space4),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = stringResource(R.string.profile_trains_here_label, workspace.name),
            modifier = Modifier.weight(1f),
            style = MaterialTheme.typography.body,
        )
        Switch(checked = workspace.trainsHere, onCheckedChange = null, enabled = !saving)
    }
    when (workspace.change) {
        TrainsHereChange.Saved -> Text(
            text = stringResource(R.string.profile_trains_here_saved),
            modifier = Modifier.testTag("${ProfileTags.TRAINS_HERE_SAVED}.${workspace.slug}")
                .semantics { liveRegion = LiveRegionMode.Polite },
            style = MaterialTheme.typography.body,
        )

        TrainsHereChange.NoConnection, TrainsHereChange.Failed -> Text(
            text = stringResource(
                if (workspace.change == TrainsHereChange.NoConnection) {
                    R.string.profile_trains_here_errors_no_connection
                } else {
                    R.string.profile_trains_here_errors_generic
                },
            ),
            modifier = Modifier.testTag("${ProfileTags.TRAINS_HERE_ERROR}.${workspace.slug}")
                .semantics { liveRegion = LiveRegionMode.Polite },
            color = MaterialTheme.colorScheme.error,
            style = MaterialTheme.typography.body,
        )

        TrainsHereChange.Idle, TrainsHereChange.Saving -> Unit
    }
}

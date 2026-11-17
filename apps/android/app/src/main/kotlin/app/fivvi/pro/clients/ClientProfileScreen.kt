package app.fivvi.pro.clients

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import app.fivvi.api.models.Client
import app.fivvi.api.models.Locale
import app.fivvi.core.R
import app.fivvi.core.kit.AvatarSizeLarge
import app.fivvi.core.kit.FivviCard
import app.fivvi.core.kit.InsetGroupedList
import app.fivvi.core.kit.PersonAvatar
import app.fivvi.core.kit.PillButton
import app.fivvi.core.kit.PillButtonStack
import app.fivvi.core.kit.PillButtonStyle
import app.fivvi.core.ui.SlowLoadingLine
import app.fivvi.core.ui.placeholder
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.body
import app.fivvi.designtokens.subhead
import app.fivvi.designtokens.title1
import app.fivvi.designtokens.title2

/** Test tags, shared with the iOS accessibility identifiers and the Maestro flows; the edit form's are `clientProfile.edit.*`. */
object ClientProfileTags {
    const val TITLE = "clientProfile.title"
    const val BACK = "clientProfile.back"
    const val LOADING = "clientProfile.loading"
    const val LOADING_SLOW = "clientProfile.loadingSlow"
    const val ERROR = "clientProfile.error"
    const val RETRY = "clientProfile.retry"
    const val NO_PERMISSION = "clientProfile.noPermission"
    const val OVERVIEW = "clientProfile.overview"
    const val AVATAR = "clientProfile.avatar"
    const val NAME = "clientProfile.name"
    const val EMAIL = "clientProfile.email"
    const val LANGUAGE = "clientProfile.language"
    const val EDIT = "clientProfile.edit"
    const val EDIT_PREFIX = "clientProfile.edit"
    const val EDIT_TITLE = "clientProfile.edit.title"
    const val EDIT_CLOSE = "clientProfile.edit.close"
    const val EDIT_SAVE = "clientProfile.edit.save"
    const val EDIT_PENDING = "clientProfile.edit.pending"
    const val SNACKBAR = "clientProfile.snackbar"

    /** The suffix of the whole row of an overview line: `clientProfile.email.row` holds the label and `clientProfile.email`. */
    const val ROW = ".row"
}

/** What the profile asks of its host. */
data class ClientProfileActions(
    val onBack: () -> Unit,
    val onRetry: () -> Unit,
    /** `null` when the person may not edit clients (no `clients.manage`): *Bewerken* is not shown. */
    val onEdit: (() -> Unit)?,
    val onCancelEdit: () -> Unit,
    val onSave: () -> Unit,
    val onSavedShown: () -> Unit,
    val onAddedShown: () -> Unit,
    val fields: ClientFormActions,
)

/**
 * *Klantprofiel* / *Client profile* (TM-03, F006 AC7, AC12) in the look of the prototype: the back button and *Bewerken*
 * (for the team) in a bar, the client's avatar and name centred under it, and the *Overzicht* as a grouped list of name,
 * address and language for emails. The edit is the same full-screen form as quick add, with *Opslaan*. [justAdded] shows
 * the short confirmation after a quick add; a save shows its own, both in a snackbar (`information-architecture.md §5.2`).
 * No empty placeholder tabs: the other parts of the profile arrive with their features.
 */
@Composable
fun ClientProfileScreen(
    state: ClientProfileState,
    workspaceDefault: Locale,
    workspaceName: String,
    justAdded: String?,
    actions: ClientProfileActions,
    modifier: Modifier = Modifier,
) {
    val edit = (state as? ClientProfileState.Loaded)?.edit
    if (edit != null) {
        Edit(edit, workspaceDefault, actions, modifier)
        return
    }
    val snackbar = remember { SnackbarHostState() }
    val savedText = stringResource(R.string.clients_profile_saved)
    val loaded = state as? ClientProfileState.Loaded
    LaunchedEffect(loaded?.saved) {
        if (loaded?.saved == true) {
            snackbar.showSnackbar(savedText)
            actions.onSavedShown()
        }
    }
    LaunchedEffect(justAdded) {
        justAdded?.let {
            snackbar.showSnackbar(it)
            actions.onAddedShown()
        }
    }
    Scaffold(
        modifier = modifier,
        snackbarHost = { SnackbarHost(snackbar, modifier = Modifier.testTag(ClientProfileTags.SNACKBAR)) },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState())) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(end = Spacing.space2),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                BackButton(ClientProfileTags.BACK, actions.onBack)
                Box(Modifier.weight(1f))
                if (loaded != null) {
                    actions.onEdit?.let { edit ->
                        PillButton(
                            text = stringResource(R.string.clients_profile_edit),
                            onClick = edit,
                            modifier = Modifier.testTag(ClientProfileTags.EDIT),
                            style = PillButtonStyle.Text,
                        )
                    }
                }
            }
            Column(
                modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.space4),
                verticalArrangement = Arrangement.spacedBy(Spacing.space4),
            ) {
                Header(loaded?.client)
                when (state) {
                    ClientProfileState.Loading -> Skeleton()
                    ClientProfileState.Failed -> Failed(actions.onRetry)
                    ClientProfileState.NoAccess -> NoPermission(workspaceName)
                    is ClientProfileState.Loaded -> Overview(state.client, workspaceDefault)
                }
            }
        }
    }
}

// The prototype's header: the large avatar and the name under it, both centred; before the client is read, only the title.
@Composable
private fun Header(client: Client?) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(Spacing.space3),
    ) {
        if (client != null) {
            PersonAvatar(client.name, Modifier.testTag(ClientProfileTags.AVATAR), AvatarSizeLarge)
        }
        Text(
            text = client?.name ?: stringResource(R.string.clients_profile_title),
            modifier = Modifier.fillMaxWidth().testTag(ClientProfileTags.TITLE).semantics { heading() },
            style = MaterialTheme.typography.title1,
            textAlign = TextAlign.Center,
        )
    }
}

// Skeleton in the shape of the overview (a heading and three rows in one group); after 10 s a line says that it takes
// longer than usual (`information-architecture.md §9.5`).
@Composable
private fun Skeleton() {
    val label = stringResource(R.string.clients_loading)
    Column(
        modifier = Modifier.fillMaxWidth().testTag(ClientProfileTags.LOADING).semantics { contentDescription = label },
        verticalArrangement = Arrangement.spacedBy(Spacing.space4),
    ) {
        Box(Modifier.fillMaxWidth(OVERVIEW_SHARE).height(Spacing.space4).placeholder())
        InsetGroupedList {
            repeat(SKELETON_FIELDS) {
                row {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(
                            horizontal = Spacing.space4,
                            vertical = Spacing.space4,
                        ),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Box(Modifier.fillMaxWidth(LABEL_SHARE).height(Spacing.space4).placeholder())
                        Box(Modifier.fillMaxWidth(VALUE_SHARE).height(Spacing.space4).placeholder())
                    }
                }
            }
        }
        SlowLoadingLine(ClientProfileTags.LOADING_SLOW)
    }
}

private const val SKELETON_FIELDS = 3
private const val OVERVIEW_SHARE = 0.3f
private const val LABEL_SHARE = 0.4f
private const val VALUE_SHARE = 0.6f

@Composable
private fun Failed(onRetry: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(Spacing.space4),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = stringResource(R.string.clients_load_error),
            modifier = Modifier.testTag(ClientProfileTags.ERROR),
            style = MaterialTheme.typography.body,
            textAlign = TextAlign.Center,
        )
        PillButtonStack {
            PillButton(
                text = stringResource(R.string.common_retry),
                onClick = onRetry,
                modifier = Modifier.testTag(ClientProfileTags.RETRY),
            )
        }
    }
}

@Composable
private fun NoPermission(workspaceName: String) {
    FivviCard(Modifier.fillMaxWidth().testTag(ClientProfileTags.NO_PERMISSION)) {
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.space2)) {
            Text(
                text = stringResource(R.string.no_permission_title),
                modifier = Modifier.semantics { heading() },
                style = MaterialTheme.typography.title2,
            )
            Text(
                text = stringResource(R.string.no_permission_body, workspaceName),
                style = MaterialTheme.typography.body,
            )
        }
    }
}

// Overzicht: name, address and language for emails, one row each with the value at the end (the prototype's `kv` rows).
// A client without a language of their own follows the workspace's default, so the line names it: *Standaard (Nederlands)*.
@Composable
private fun Overview(client: Client, workspaceDefault: Locale) {
    val language = languageLine(client.emailLocale, workspaceDefault)
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.space2)) {
        Text(
            text = stringResource(R.string.clients_profile_overview),
            modifier = Modifier.padding(start = Spacing.space4).testTag(ClientProfileTags.OVERVIEW)
                .semantics { heading() },
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.subhead,
        )
        InsetGroupedList {
            row { DetailRow(R.string.clients_profile_name_label, client.name, ClientProfileTags.NAME) }
            row { DetailRow(R.string.clients_profile_email_label, client.email, ClientProfileTags.EMAIL) }
            row { DetailRow(R.string.clients_profile_locale_label, language, ClientProfileTags.LANGUAGE) }
        }
    }
}

@Composable
private fun languageLine(locale: Client.EmailLocale?, workspaceDefault: Locale): String = when (locale) {
    Client.EmailLocale.NL_NL -> stringResource(R.string.clients_add_dialog_locale_nl)

    Client.EmailLocale.EN -> stringResource(R.string.clients_add_dialog_locale_en)

    null -> stringResource(
        R.string.clients_add_dialog_locale_default,
        stringResource(
            if (workspaceDefault ==
                Locale.EN
            ) {
                R.string.clients_language_names_en
            } else {
                R.string.clients_language_names_nl
            },
        ),
    )
}

// The label at the start and the value at the end of the row, in the secondary colour (the prototype's `kv` row).
@Composable
private fun DetailRow(label: Int, value: String, tag: String) {
    Row(
        modifier = Modifier.fillMaxWidth().testTag(tag + ClientProfileTags.ROW)
            .padding(horizontal = Spacing.space4, vertical = Spacing.space3),
        horizontalArrangement = Arrangement.spacedBy(Spacing.space4),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text = stringResource(label), style = MaterialTheme.typography.body)
        Text(
            text = value,
            modifier = Modifier.weight(1f).testTag(tag),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.body,
            textAlign = TextAlign.End,
        )
    }
}

// The edit: the add form's fields, with ✕ and *Opslaan* in the bar.
@Composable
private fun Edit(edit: ClientEdit, workspaceDefault: Locale, actions: ClientProfileActions, modifier: Modifier) {
    ClientFormFrame(
        title = stringResource(R.string.clients_profile_edit_title),
        tags = ClientFormBarTags(
            ClientProfileTags.EDIT_TITLE,
            ClientProfileTags.EDIT_CLOSE,
            ClientProfileTags.EDIT_SAVE,
            ClientProfileTags.EDIT_PENDING,
        ),
        submitText = stringResource(R.string.clients_profile_save),
        pending = edit.pending,
        onClose = actions.onCancelEdit,
        onSubmit = actions.onSave,
        modifier = modifier,
    ) {
        ClientFormFields(
            tag = ClientProfileTags.EDIT_PREFIX,
            form = edit.form,
            messages = ClientFormMessages(edit.nameError, edit.emailError, edit.duplicate, edit.failed),
            workspaceDefault = workspaceDefault,
            enabled = !edit.pending,
            actions = actions.fields,
        )
    }
}

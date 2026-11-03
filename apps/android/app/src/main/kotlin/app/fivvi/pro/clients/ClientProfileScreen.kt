package app.fivvi.pro.clients

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import app.fivvi.api.models.Client
import app.fivvi.api.models.Locale
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.body
import app.fivvi.designtokens.footnote
import app.fivvi.designtokens.title2
import app.fivvi.pro.R

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
 * *Klantprofiel* / *Client profile* (TM-03, F006 AC7, AC12): the header with the client's name and the *Overzicht* with
 * name, address and language for emails, and *Bewerken* for the team. The edit is the same full-screen form as quick add,
 * with *Opslaan*. [justAdded] shows the short confirmation after a quick add; a save shows its own, both in a snackbar
 * (`information-architecture.md §5.2`). No empty placeholder tabs: the other parts of the profile arrive with their
 * features.
 */
@OptIn(ExperimentalMaterial3Api::class)
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
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = loaded?.client?.name ?: stringResource(R.string.clients_profile_title),
                        modifier = Modifier.testTag(ClientProfileTags.TITLE).semantics { heading() },
                    )
                },
                navigationIcon = { BackButton(ClientProfileTags.BACK, actions.onBack) },
                actions = {
                    if (loaded != null) {
                        actions.onEdit?.let { edit ->
                            TextButton(onClick = edit, modifier = Modifier.testTag(ClientProfileTags.EDIT)) {
                                Text(stringResource(R.string.clients_profile_edit))
                            }
                        }
                    }
                },
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(Spacing.space4)) {
            when (state) {
                ClientProfileState.Loading -> Skeleton()
                ClientProfileState.Failed -> Failed(actions.onRetry)
                ClientProfileState.NoAccess -> NoPermission(workspaceName)
                is ClientProfileState.Loaded -> Overview(state.client, workspaceDefault)
            }
        }
    }
}

// Skeleton in the shape of the overview (name, address, language); after 10 s a line says that it takes longer than usual
// (`information-architecture.md §9.5`).
@Composable
private fun Skeleton() {
    val label = stringResource(R.string.clients_loading)
    Column(
        modifier = Modifier.fillMaxWidth().testTag(ClientProfileTags.LOADING).semantics { contentDescription = label },
        verticalArrangement = Arrangement.spacedBy(Spacing.space4),
    ) {
        Box(Modifier.fillMaxWidth(OVERVIEW_SHARE).height(Spacing.space5).placeholder())
        repeat(SKELETON_FIELDS) {
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.space2)) {
                Box(Modifier.fillMaxWidth(LABEL_SHARE).height(Spacing.space3).placeholder())
                Box(Modifier.fillMaxWidth(VALUE_SHARE).height(Spacing.space4).placeholder())
            }
        }
        SlowLoadingLine(ClientProfileTags.LOADING_SLOW)
    }
}

private const val SKELETON_FIELDS = 3
private const val OVERVIEW_SHARE = 0.4f
private const val LABEL_SHARE = 0.25f
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
        Button(onClick = onRetry, modifier = Modifier.testTag(ClientProfileTags.RETRY)) {
            Text(stringResource(R.string.common_retry))
        }
    }
}

@Composable
private fun NoPermission(workspaceName: String) {
    Column(
        modifier = Modifier.fillMaxWidth().testTag(ClientProfileTags.NO_PERMISSION),
        verticalArrangement = Arrangement.spacedBy(Spacing.space2),
    ) {
        Text(
            text = stringResource(R.string.no_permission_title),
            modifier = Modifier.semantics { heading() },
            style = MaterialTheme.typography.title2,
        )
        Text(text = stringResource(R.string.no_permission_body, workspaceName), style = MaterialTheme.typography.body)
    }
}

// Overzicht: name, address and language for emails. A client without a language of their own follows the workspace's
// default, so the line names it: *Standaard (Nederlands)*.
@Composable
private fun Overview(client: Client, workspaceDefault: Locale) {
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.space4)) {
        Text(
            text = stringResource(R.string.clients_profile_overview),
            modifier = Modifier.testTag(ClientProfileTags.OVERVIEW).semantics { heading() },
            style = MaterialTheme.typography.title2,
        )
        Field(R.string.clients_profile_name_label, client.name, ClientProfileTags.NAME)
        Field(
            R.string.clients_profile_email_label,
            client.email,
            ClientProfileTags.EMAIL,
        )
        Field(
            R.string.clients_profile_locale_label,
            languageLine(client.emailLocale, workspaceDefault),
            ClientProfileTags.LANGUAGE,
        )
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

@Composable
private fun Field(label: Int, value: String, tag: String) {
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.space1)) {
        Text(
            text = stringResource(label),
            style = MaterialTheme.typography.footnote,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(text = value, modifier = Modifier.testTag(tag), style = MaterialTheme.typography.body)
    }
}

// The edit: the add form's fields, with ✕ and *Opslaan* in the bar.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun Edit(edit: ClientEdit, workspaceDefault: Locale, actions: ClientProfileActions, modifier: Modifier) {
    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        stringResource(R.string.clients_profile_edit_title),
                        modifier = Modifier.testTag(ClientProfileTags.EDIT_TITLE).semantics { heading() },
                    )
                },
                navigationIcon = {
                    IconButton(
                        onClick = actions.onCancelEdit,
                        modifier = Modifier.testTag(ClientProfileTags.EDIT_CLOSE),
                    ) {
                        Icon(
                            painterResource(R.drawable.ic_close),
                            contentDescription = stringResource(R.string.clients_add_dialog_close),
                        )
                    }
                },
                actions = {
                    if (edit.pending) {
                        val label = stringResource(R.string.common_loading)
                        CircularProgressIndicator(
                            Modifier.padding(end = Spacing.space4).testTag(ClientProfileTags.EDIT_PENDING)
                                .semantics { contentDescription = label },
                        )
                    } else {
                        TextButton(onClick = actions.onSave, modifier = Modifier.testTag(ClientProfileTags.EDIT_SAVE)) {
                            Text(stringResource(R.string.clients_profile_save))
                        }
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).imePadding().verticalScroll(rememberScrollState())
                .padding(Spacing.space4),
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
}

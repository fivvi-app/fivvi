package app.fivvi.pro.clients

import androidx.activity.compose.BackHandler
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.fivvi.api.apis.ClientsApi
import app.fivvi.api.apis.SessionsApi
import app.fivvi.api.apis.WorkspacesApi
import app.fivvi.api.models.MeWorkspace
import app.fivvi.core.R
import app.fivvi.pro.capabilities.WorkspaceCapabilities
import java.util.UUID

/** Which of the three screens is shown. Kept across a rotation with [rememberSaveable]. */
private object Screen {
    const val LIST = "list"
    const val ADD = "add"
    const val PROFILE = "profile"
}

/**
 * *Klanten* and what it opens (F006, M4): the list (TM-02), the full-screen *+ Nieuwe klant* and the profile (TM-03), one
 * level of navigation each, so at most two pushes from the home (`information-architecture.md §5.1`). System back goes one
 * step: out of an edit, from the profile or the form to the list, from the list to [onClose]. [sessionKey] belongs to one
 * sign-in, so the list read in memory is dropped with it. When the home shows another workspace after the foreground
 * read (F003 AC6), the flow starts again at that workspace's list: an open profile or form belongs to the workspace
 * before, whose client the new one doesn't have. *+ Nieuwe klant* and *Bewerken* show only while [capabilities] lists
 * `clients.manage` for the workspace (F004 AC10); the helper is the only thing that decides it.
 */
@Composable
fun ClientsFlow(
    clientsApi: ClientsApi,
    workspacesApi: WorkspacesApi,
    capabilities: WorkspaceCapabilities,
    workspaceId: UUID,
    workspaceName: String,
    sessionKey: String,
    onClose: () -> Unit,
    sessionsApi: SessionsApi? = null,
    onOpenSession: (UUID) -> Unit = {},
    openClient: UUID? = null,
) {
    // A new composition per workspace, so the screen kept across a rotation is the list again after a switch.
    key(workspaceId) {
        ClientsFlowContent(
            clientsApi,
            workspacesApi,
            capabilities,
            workspaceId,
            workspaceName,
            sessionKey,
            onClose,
            sessionsApi,
            onOpenSession,
            openClient,
        )
    }
}

@Composable
private fun ClientsFlowContent(
    clientsApi: ClientsApi,
    workspacesApi: WorkspacesApi,
    capabilities: WorkspaceCapabilities,
    workspaceId: UUID,
    workspaceName: String,
    sessionKey: String,
    onClose: () -> Unit,
    sessionsApi: SessionsApi?,
    onOpenSession: (UUID) -> Unit,
    openClient: UUID?,
) {
    // [openClient] opens that client's profile at once (from a session's screen); back then leaves the flow, as there is
    // no list behind it.
    var screen by rememberSaveable { mutableStateOf(if (openClient != null) Screen.PROFILE else Screen.LIST) }
    var profileId by rememberSaveable { mutableStateOf(openClient?.toString()) }
    var justAdded by rememberSaveable { mutableStateOf<String?>(null) }
    // Each opening of the form or a profile gets a new view model, so a form starts empty. The counter restarts with
    // every composition of the flow (a workspace switch, closing Klanten), so [visit], which is new each time and
    // never repeats, keeps the keys of an earlier visit's view models (which live as long as the activity) apart.
    val visit = rememberSaveable { UUID.randomUUID().toString() }
    var openings by rememberSaveable { mutableIntStateOf(0) }
    val snapshot by capabilities.capabilities.collectAsStateWithLifecycle()
    val mayManage = snapshot.mayShow(workspaceId, MeWorkspace.Capabilities.CLIENTS_PERIOD_MANAGE)
    val list = clientsViewModel(clientsApi, workspacesApi, capabilities, workspaceId, sessionKey)
    val workspace by list.workspace.collectAsStateWithLifecycle()

    fun showList() {
        if (openClient != null) return onClose()
        screen = Screen.LIST
        profileId = null
        list.refresh()
    }

    fun openProfile(id: UUID, added: String? = null) {
        profileId = id.toString()
        justAdded = added
        openings++
        screen = Screen.PROFILE
    }

    when (screen) {
        Screen.ADD -> {
            val add = viewModel(key = "addClient-$sessionKey-$workspaceId-$visit-$openings") {
                AddClientViewModel(
                    clientsApi,
                    workspaceId,
                    onNotAllowed = {
                        capabilities.onResponse(it, workspaceId, MeWorkspace.Capabilities.CLIENTS_PERIOD_MANAGE)
                    },
                )
            }
            val state by add.state.collectAsStateWithLifecycle()
            val addedText = state.added?.let { stringResource(R.string.clients_profile_added, it.name) }
            BackHandler { showList() }
            // The add is done: the new client's profile opens, with a short confirmation.
            LaunchedEffect(state.added) { state.added?.let { openProfile(it.id, addedText) } }
            // The API refused the add (403): the action is hidden now, so the form closes.
            LaunchedEffect(state.notAllowed) { if (state.notAllowed) showList() }
            AddClientScreen(
                state,
                workspace.defaultLocale,
                AddClientActions(
                    onClose = ::showList,
                    onSubmit = add::submit,
                    fields = ClientFormActions(
                        onNameChange = add::onNameChange,
                        onEmailChange = add::onEmailChange,
                        onLanguageChange = add::onLanguageChange,
                        onOpenExisting = { openProfile(it.id) },
                        onUseAnotherEmail = add::useAnotherEmail,
                        onDone = add::submit,
                    ),
                ),
            )
        }

        Screen.PROFILE -> {
            val id = UUID.fromString(profileId)
            val profile = viewModel(key = "clientProfile-$sessionKey-$workspaceId-$visit-$id-$openings") {
                ClientProfileViewModel(
                    clientsApi,
                    workspaceId,
                    id,
                    onNotAllowed = {
                        capabilities.onResponse(it, workspaceId, MeWorkspace.Capabilities.CLIENTS_PERIOD_VIEW)
                    },
                    // The save is what clients.manage guards: a refusal hides Bewerken, not Klanten.
                    onSaveNotAllowed = {
                        capabilities.onResponse(it, workspaceId, MeWorkspace.Capabilities.CLIENTS_PERIOD_MANAGE)
                    },
                    sessionsApi = sessionsApi,
                )
            }
            val state by profile.state.collectAsStateWithLifecycle()
            val upcoming by profile.upcoming.collectAsStateWithLifecycle()
            val edit = (state as? ClientProfileState.Loaded)?.edit
            val editing = edit != null
            // The API refused the save (403, 404): the action is hidden now, so the edit closes, as the form does.
            LaunchedEffect(edit?.notAllowed) { if (edit?.notAllowed == true) profile.cancelEdit() }
            BackHandler { if (editing) profile.cancelEdit() else showList() }
            // On foreground the client is read again: a change made elsewhere shows (AC7).
            OnForeground(profile::refresh)
            // Back from a session that may have moved (F020 AC9): the sessions are read again.
            LaunchedEffect(Unit) { profile.refreshUpcoming() }
            ClientProfileScreen(
                state,
                workspace.defaultLocale,
                workspaceName,
                justAdded,
                ClientProfileActions(
                    onBack = ::showList,
                    onRetry = profile::retry,
                    onEdit = if (mayManage) profile::startEdit else null,
                    onCancelEdit = profile::cancelEdit,
                    onSave = profile::save,
                    onSavedShown = profile::onSavedShown,
                    onAddedShown = { justAdded = null },
                    fields = ClientFormActions(
                        onNameChange = profile::onNameChange,
                        onEmailChange = profile::onEmailChange,
                        onLanguageChange = profile::onLanguageChange,
                        onOpenExisting = {
                            profile.cancelEdit()
                            openProfile(it.id)
                        },
                        onUseAnotherEmail = profile::useAnotherEmail,
                        onDone = profile::save,
                    ),
                    onOpenSession = onOpenSession,
                ),
                upcoming,
            )
        }

        else -> {
            val state by list.state.collectAsStateWithLifecycle()
            val query by list.query.collectAsStateWithLifecycle()
            val refreshing by list.refreshing.collectAsStateWithLifecycle()
            BackHandler(onBack = onClose)
            OnForeground(list::refresh)
            ClientsScreen(
                state,
                query,
                refreshing,
                workspace,
                workspaceName,
                ClientsActions(
                    onBack = onClose,
                    onQueryChange = list::onQueryChange,
                    onRefresh = list::refresh,
                    onRetry = list::retry,
                    onOpen = { openProfile(it) },
                    onAdd = if (mayManage) {
                        {
                            openings++
                            screen = Screen.ADD
                        }
                    } else {
                        null
                    },
                ),
            )
        }
    }
}

/**
 * The list of the workspace's clients of one sign-in. *Klanten* and the client list of the new private session (F020)
 * ask for it with the same key, so they read and search the same list.
 */
@Composable
internal fun clientsViewModel(
    clientsApi: ClientsApi,
    workspacesApi: WorkspacesApi,
    capabilities: WorkspaceCapabilities,
    workspaceId: UUID,
    sessionKey: String,
): ClientsViewModel = viewModel(key = "clients-$sessionKey-$workspaceId") {
    ClientsViewModel(
        clientsApi,
        workspacesApi,
        workspaceId,
        onNotAllowed = { capabilities.onResponse(it, workspaceId, MeWorkspace.Capabilities.CLIENTS_PERIOD_VIEW) },
    )
}

// Runs [action] each time the app comes back to the foreground, not at the start that composing this already covers.
@Composable
private fun OnForeground(action: () -> Unit) {
    var first by remember { mutableStateOf(true) }
    LifecycleEventEffect(Lifecycle.Event.ON_START) {
        if (first) first = false else action()
    }
}

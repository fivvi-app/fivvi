package app.fivvi.pro.sessions

import androidx.activity.compose.BackHandler
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.fivvi.api.models.Client
import app.fivvi.api.models.MeWorkspace
import app.fivvi.core.ui.OnForeground
import app.fivvi.pro.capabilities.WorkspaceCapabilities
import app.fivvi.pro.clients.AddClientActions
import app.fivvi.pro.clients.AddClientScreen
import app.fivvi.pro.clients.AddClientViewModel
import app.fivvi.pro.clients.ClientFormActions
import app.fivvi.pro.clients.ClientsState
import app.fivvi.pro.clients.clientsViewModel
import java.io.IOException
import java.util.UUID
import kotlinx.coroutines.launch
import kotlinx.serialization.SerializationException

/** Which of the three screens of PS-04 is shown. Kept across a rotation with [rememberSaveable]. */
private object Step {
    const val FORM = "form"
    const val CLIENTS = "clients"
    const val ADD = "add"
}

/**
 * **+** → *Privésessie* (PS-04, F020): the form, the client list it opens and the quick add of *Klanten* inside that list,
 * one full-screen surface each. System back goes one step: from the quick add to the list, from the list to the form, and
 * from the form out (with a confirmation first when something was entered). When the API has planned the session,
 * [onSaved] is told its ID: the host opens TD-02. [forAnyTrainer] is `session.private.manage.any`, [mayAddClients]
 * `clients.manage`; [sessionKey] belongs to one sign-in and [opening] to one opening of the form, so each opening starts
 * with an empty form.
 */
@Composable
fun NewSessionFlow(
    apis: SessionApis,
    capabilities: WorkspaceCapabilities,
    workspaceId: UUID,
    workspaceName: String,
    forAnyTrainer: Boolean,
    mayAddClients: Boolean,
    email: String,
    accountName: String?,
    sessionKey: String,
    opening: Int,
    onClose: () -> Unit,
    onSaved: (UUID) -> Unit,
) {
    val model = viewModel(key = "newSession-$sessionKey-$workspaceId-$opening") {
        NewSessionViewModel(
            apis,
            workspaceId,
            forAnyTrainer,
            email,
            accountName,
            onNotAllowed = {
                capabilities.onResponse(
                    it,
                    workspaceId,
                    MeWorkspace.Capabilities.SESSION_PERIOD_PRIVATE_PERIOD_MANAGE_PERIOD_OWN,
                )
            },
        )
    }
    val state by model.state.collectAsStateWithLifecycle()
    var step by rememberSaveable { mutableStateOf(Step.FORM) }
    var confirmingDiscard by rememberSaveable { mutableStateOf(false) }
    var addings by rememberSaveable { mutableIntStateOf(0) }

    // Back from the app switcher: a form that was offline reads again.
    OnForeground { if (state.isOffline) model.start() }
    LaunchedEffect(state.saved) {
        state.saved?.let {
            model.onSavedHandled()
            onSaved(it.id)
        }
    }

    fun leave() {
        if (state.isDirty) confirmingDiscard = true else onClose()
    }

    when (step) {
        Step.CLIENTS, Step.ADD -> {
            val clients = clientsViewModel(apis.clients, apis.workspaces, capabilities, workspaceId, sessionKey)
            val list by clients.state.collectAsStateWithLifecycle()
            val query by clients.query.collectAsStateWithLifecycle()
            val scope = rememberCoroutineScope()

            // Leaving the list empties its search, so the next opening shows every client (and so does *Klanten*).
            fun backToForm() {
                clients.onQueryChange("")
                step = Step.FORM
            }

            fun pick(client: Client) {
                model.chooseClient(client)
                backToForm()
            }
            if (step == Step.ADD) {
                val add = viewModel(key = "newSessionAdd-$sessionKey-$workspaceId-$opening-$addings") {
                    AddClientViewModel(
                        apis.clients,
                        workspaceId,
                        onNotAllowed = {
                            capabilities.onResponse(it, workspaceId, MeWorkspace.Capabilities.CLIENTS_PERIOD_MANAGE)
                        },
                    )
                }
                val adding by add.state.collectAsStateWithLifecycle()
                val workspace by clients.workspace.collectAsStateWithLifecycle()
                BackHandler { step = Step.CLIENTS }
                // The name typed in the search is the name of the new client.
                LaunchedEffect(Unit) { if (query.isNotBlank()) add.onNameChange(query.trim()) }
                // The add is done: the new client is the client of the session.
                LaunchedEffect(adding.added) {
                    adding.added?.let {
                        clients.refresh()
                        pick(it)
                    }
                }
                LaunchedEffect(adding.notAllowed) { if (adding.notAllowed) step = Step.CLIENTS }
                AddClientScreen(
                    adding,
                    workspace.defaultLocale,
                    AddClientActions(
                        onClose = { step = Step.CLIENTS },
                        onSubmit = add::submit,
                        fields = ClientFormActions(
                            onNameChange = add::onNameChange,
                            onEmailChange = add::onEmailChange,
                            onLanguageChange = add::onLanguageChange,
                            onOpenExisting = { existing ->
                                // A client of the workspace has the address: that client is the one.
                                scope.launch {
                                    val found =
                                        list.let { shown ->
                                            (shown as? ClientsState.Loaded)?.clients
                                        }
                                            ?.firstOrNull { it.id == existing.id }
                                            ?: read(apis, workspaceId, existing.id)
                                    found?.let(::pick)
                                }
                            },
                            onUseAnotherEmail = add::useAnotherEmail,
                            onDone = add::submit,
                        ),
                    ),
                )
            } else {
                BackHandler(onBack = ::backToForm)
                ClientPickerScreen(
                    list,
                    query,
                    workspaceName,
                    ClientPickerActions(
                        onBack = ::backToForm,
                        onQueryChange = clients::onQueryChange,
                        onRetry = clients::retry,
                        onPick = ::pick,
                        onAdd = if (mayAddClients) {
                            {
                                addings++
                                step = Step.ADD
                            }
                        } else {
                            null
                        },
                    ),
                )
            }
        }

        else -> {
            BackHandler(onBack = ::leave)
            NewSessionScreen(
                state = state,
                forAnyTrainer = forAnyTrainer,
                ownName = accountName ?: email,
                workspaceName = workspaceName,
                confirmingDiscard = confirmingDiscard,
                onDismissDiscard = { confirmingDiscard = false },
                onDiscard = {
                    confirmingDiscard = false
                    onClose()
                },
                actions = NewSessionActions(
                    onClose = ::leave,
                    onSave = { model.save() },
                    onSaveAnyway = { model.save(allowConflicts = true) },
                    onDismissDoubleBooking = model::dismissDoubleBooking,
                    onRetry = model::start,
                    onPickClient = { step = Step.CLIENTS },
                    onNotify = model::setNotify,
                    onTrainer = model::setTrainer,
                    time = SessionTimeActions(
                        onDate = model::setDate,
                        onStart = model::setStart,
                        onChooseDuration = model::chooseDuration,
                        onOtherDuration = model::setOtherDuration,
                    ),
                ),
            )
        }
    }
}

// A client by ID, when the list the person sees doesn't hold it (a long list shows its first page only).
private suspend fun read(apis: SessionApis, workspaceId: UUID, clientId: UUID): Client? = try {
    apis.clients.getClient(workspaceId, clientId).let { found -> found.body()?.takeIf { found.isSuccessful } }
} catch (_: IOException) {
    null
} catch (_: SerializationException) {
    null
}

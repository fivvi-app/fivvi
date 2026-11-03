package app.fivvi.pro.clients

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fivvi.api.apis.ClientsApi
import app.fivvi.api.apis.WorkspacesApi
import app.fivvi.api.models.Client
import java.io.IOException
import java.net.HttpURLConnection.HTTP_FORBIDDEN
import java.net.HttpURLConnection.HTTP_NOT_FOUND
import java.time.Instant
import java.util.UUID
import kotlin.time.Duration
import kotlin.time.Duration.Companion.milliseconds
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.SerializationException
import retrofit2.Response

sealed interface ClientsState {
    data object Loading : ClientsState

    /**
     * One page of the workspace's clients, sorted by name by the API, with how many match in all. [updatedAt] is when
     * they were read; [offline] says the latest read failed, so what shows is the list read before.
     */
    data class Loaded(
        val clients: List<Client>,
        val total: Int,
        val updatedAt: Instant,
        val offline: Boolean = false,
    ) : ClientsState

    /** The first read failed: the error with *Opnieuw proberen*. */
    data object Failed : ClientsState

    /** The API refused the list (403, 404): the person may not see clients here (any more). */
    data object NoAccess : ClientsState
}

/**
 * *Klanten* (TM-02, F006 AC6, AC12): the workspace's clients and the search, both from `GET /workspaces/{id}/clients`
 * through the generated client. The server sorts and matches (part of a name or an address, ignoring case and accents);
 * nothing is matched here. [onQueryChange] asks again when the typing pauses for [debounce]. A list that was read stays on
 * screen when a later read fails, with the time it was read (the offline pattern, `information-architecture.md §9.5`):
 * it is kept in memory only, so no client leaves the phone's memory. [onNotAllowed] is told a refused answer, so the
 * capability helper can hide what it guards (F004 AC10).
 */
class ClientsViewModel(
    private val api: ClientsApi,
    private val workspacesApi: WorkspacesApi,
    private val workspaceId: UUID,
    private val onNotAllowed: (Response<*>) -> Unit = {},
    private val clock: () -> Instant = Instant::now,
    private val debounce: Duration = SEARCH_PAUSE,
) : ViewModel() {
    private val _state = MutableStateFlow<ClientsState>(ClientsState.Loading)
    val state: StateFlow<ClientsState> = _state.asStateFlow()
    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()
    private val _refreshing = MutableStateFlow(false)

    /** A pull to refresh is under way; the list stays on screen. */
    val refreshing: StateFlow<Boolean> = _refreshing.asStateFlow()
    private val _workspace = MutableStateFlow(WorkspaceDefaults())
    val workspace: StateFlow<WorkspaceDefaults> = _workspace.asStateFlow()
    private var loading: Job? = null

    init {
        viewModelScope.launch { _workspace.value = workspacesApi.defaultsOf(workspaceId) }
        load()
    }

    fun onQueryChange(query: String) {
        _query.value = query
        loading?.cancel()
        loading = viewModelScope.launch {
            delay(debounce)
            fetch()
        }
    }

    fun retry() {
        _state.value = ClientsState.Loading
        load()
    }

    /** Pull to refresh, and the return from a screen that may have changed a client. */
    fun refresh() {
        _refreshing.value = true
        load()
    }

    private fun load() {
        loading?.cancel()
        loading = viewModelScope.launch { fetch() }
    }

    private suspend fun fetch() {
        val search = _query.value.trim().ifEmpty { null }
        val response = try {
            api.listClients(workspaceId, search)
        } catch (_: IOException) {
            return failed()
        } catch (_: SerializationException) {
            return failed()
        }
        val list = response.body()?.takeIf { response.isSuccessful }
        if (list != null) {
            _state.value = ClientsState.Loaded(list.items, list.total, clock())
        } else if (response.code() == HTTP_FORBIDDEN || response.code() == HTTP_NOT_FOUND) {
            onNotAllowed(response)
            _state.value = ClientsState.NoAccess
        } else {
            failed()
        }
        _refreshing.value = false
    }

    private fun failed() {
        _refreshing.value = false
        _state.value = when (val shown = _state.value) {
            is ClientsState.Loaded -> shown.copy(offline = true)
            else -> ClientsState.Failed
        }
    }

    private companion object {
        val SEARCH_PAUSE = 300.milliseconds
    }
}

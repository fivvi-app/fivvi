package app.fivvi.pro.capabilities

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fivvi.api.apis.MeApi
import app.fivvi.api.models.MeWorkspace
import java.io.IOException
import java.net.HttpURLConnection.HTTP_FORBIDDEN
import java.util.UUID
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.SerializationException
import retrofit2.Response

/** What the API lists per workspace: the answer to "may I show this action here?" for a [Capabilities] snapshot. */
data class Capabilities(private val byWorkspace: Map<UUID, Set<MeWorkspace.Capabilities>> = emptyMap()) {
    /** Whether an action guarded by [capability] shows in [workspaceId]: only when the API lists it there. */
    fun mayShow(workspaceId: UUID, capability: MeWorkspace.Capabilities): Boolean =
        byWorkspace[workspaceId]?.contains(capability) == true

    fun without(workspaceId: UUID, capability: MeWorkspace.Capabilities): Capabilities =
        copy(byWorkspace = byWorkspace + (workspaceId to byWorkspace[workspaceId].orEmpty() - capability))
}

/**
 * The one helper that answers "may I show this action here?" (F004 AC10, spec #172). It holds what the API lists per
 * workspace in `GET /api/v1/me` (`MeWorkspace.capabilities`, the answer the home reads on opening and the app reads again
 * on foreground), and nothing else in the app decides whether an action shows: no screen tests the role name. The API
 * refuses the rest with 403 anyway, so this is only what is shown. Until the API has answered, and for a workspace it
 * doesn't list, nothing shows.
 *
 * [replace] takes each `GET /api/v1/me` answer. A 403 from a call that a capability guards goes to [onResponse]: the
 * action is hidden at once and the account is read again; the list the API gives from then on decides.
 */
class WorkspaceCapabilities(private val api: MeApi) : ViewModel() {
    private val _capabilities = MutableStateFlow(Capabilities())

    /** What is listed now, for a screen to collect: it changes when an answer of the API replaces it. */
    val capabilities: StateFlow<Capabilities> = _capabilities.asStateFlow()
    private var reading: Job? = null

    fun mayShow(workspaceId: UUID, capability: MeWorkspace.Capabilities): Boolean =
        _capabilities.value.mayShow(workspaceId, capability)

    /** Takes what `GET /api/v1/me` listed. A workspace listed twice counts once, the later entry. */
    fun replace(workspaces: List<MeWorkspace>) {
        _capabilities.value = Capabilities(workspaces.associate { it.id to it.capabilities.toSet() })
    }

    /**
     * Call this with the answer of a call that [capability] guards in [workspaceId]. A 403 hides the action and reads the
     * account again; any other answer changes nothing. A read that fails leaves the action hidden.
     */
    fun onResponse(response: Response<*>, workspaceId: UUID, capability: MeWorkspace.Capabilities) {
        if (response.code() != HTTP_FORBIDDEN) return
        _capabilities.update { it.without(workspaceId, capability) }
        reading?.cancel()
        reading = viewModelScope.launch { read()?.let(::replace) }
    }

    private suspend fun read(): List<MeWorkspace>? {
        val response = try {
            api.getMe()
        } catch (_: IOException) {
            return null
        } catch (_: SerializationException) {
            return null
        }
        return response.body()?.takeIf { response.isSuccessful }?.workspaces
    }
}

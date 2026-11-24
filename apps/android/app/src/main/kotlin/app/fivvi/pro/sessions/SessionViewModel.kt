package app.fivvi.pro.sessions

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fivvi.api.models.Client
import app.fivvi.api.models.Locale
import app.fivvi.api.models.LocationAddress
import app.fivvi.api.models.Session
import app.fivvi.api.models.SessionParticipant
import app.fivvi.pro.clients.WorkspaceDefaults
import app.fivvi.pro.clients.defaultsOf
import java.io.IOException
import java.net.HttpURLConnection.HTTP_FORBIDDEN
import java.net.HttpURLConnection.HTTP_NOT_FOUND
import java.net.URLEncoder
import java.util.UUID
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.SerializationException
import retrofit2.Response

/** The address of a location as the maps app is asked for the way there. */
object SessionRoute {
    /** The route to [address] in the maps app; `null` when the location has no address. */
    fun url(address: LocationAddress?): String? {
        address ?: return null
        val number = listOfNotNull(address.houseNumber, address.houseNumberAddition).joinToString(" ")
        val destination = "${address.street} $number, ${address.postcode} ${address.city}"
        return "https://www.google.com/maps/dir/?api=1&destination=" +
            URLEncoder.encode(destination, "UTF-8").replace("+", "%20")
    }
}

sealed interface SessionLoad {
    data object Loading : SessionLoad

    data object Loaded : SessionLoad

    data object Failed : SessionLoad

    /** The API refused this session (the team access is gone, or it is not in the workspace). */
    data object NoPermission : SessionLoad
}

/** What TD-02 shows and holds. */
data class SessionState(
    /** The person's own team-member ID in the workspace (`GET /api/v1/me`): a session whose trainer has it reads *Jij*. */
    val myTeamMemberId: UUID,
    val load: SessionLoad = SessionLoad.Loading,
    val session: Session? = null,
    val workspace: WorkspaceDefaults = WorkspaceDefaults(),
    /** The client's own record, for the language of the change email (PS-05); `null` until read, or when it can't be. */
    val clientRecord: Client? = null,
    /** The session as it was just moved: the screen says where it went. */
    val moved: Session? = null,
    /** The person has `session.private.cancel.any` (the Owner) or `.own` (a Trainer, for a session of their own) (F026). */
    val mayCancelAny: Boolean = false,
    val mayCancelOwn: Boolean = false,
    /** The phone's connection, from the network (`Connectivity`); the state of a model made without one says online. */
    val online: Boolean = true,
    /** The last read or cancellation couldn't reach the API: the fallback when the network said online. */
    val requestFailedOffline: Boolean = false,
    /** The person has just cancelled it: the screen says so, as the web's "Sessie geannuleerd." does. */
    val justCancelled: Boolean = false,
) {
    val client: SessionParticipant? get() = session?.participants?.firstOrNull()
    val isCancelled: Boolean get() = session?.status == Session.Status.CANCELLED
    val trainerIsMe: Boolean get() = session?.trainer?.id.let { it != null && it == myTeamMemberId }
    val routeUrl: String? get() = SessionRoute.url(session?.location?.address)

    /** *Annuleren* is off: the network says offline, or the last read or cancellation couldn't reach the API. */
    val isOffline: Boolean get() = requestFailedOffline || !online

    /**
     * *Annuleren* (PS-06) is offered: the session is still planned and the person may cancel it, the Owner any session and a
     * Trainer their own.
     */
    val canCancel: Boolean
        get() = session?.status == Session.Status.SCHEDULED && (mayCancelAny || (mayCancelOwn && trainerIsMe))

    /** The language the client's emails go out in: their own, else the workspace's default. */
    val emailLocale: Locale
        get() = when (clientRecord?.emailLocale) {
            Client.EmailLocale.EN -> Locale.EN
            Client.EmailLocale.NL_NL -> Locale.NL_NL
            null -> workspace.defaultLocale
        }
}

/**
 * TD-02 *Privésessie* (F020 AC10, design): the session's title, date and time, where it is with *Route*, the workspace with
 * the trainer (*Jij* for the person looking), and its client. Read from `GET …/sessions/{id}` through the generated
 * client; what is shown stays when a later read fails. The sections of later features (workout, last time, notes,
 * attendance) are not shown yet. [teamMemberId] is the person's own team-member ID in the workspace, which the trainer row
 * is compared with; [onNotAllowed] is told a 403.
 */
class SessionViewModel(
    private val apis: SessionApis,
    private val workspaceId: UUID,
    private val sessionId: UUID,
    private val teamMemberId: UUID,
    private val onNotAllowed: (Response<*>) -> Unit = {},
) : ViewModel() {
    private val _state = MutableStateFlow(SessionState(myTeamMemberId = teamMemberId))
    val state: StateFlow<SessionState> = _state.asStateFlow()
    private var reading: Job? = null

    init {
        load()
    }

    fun retry() {
        _state.update { it.copy(load = SessionLoad.Loading) }
        load()
    }

    /** The screen is shown again: read the session again and leave what is on screen until the answer is there. */
    fun refresh() = load()

    /** The session moved: it shows the new time at once and says where it went. */
    fun didMove(moved: Session) = _state.update { it.copy(session = moved, moved = moved) }

    /** The session is cancelled: it shows the record at once and says so. */
    fun didCancel(cancelled: Session) = _state.update {
        it.copy(session = cancelled, moved = null, justCancelled = true, requestFailedOffline = false)
    }

    /** A cancellation couldn't reach the API. */
    fun cancelWasOffline() = _state.update { it.copy(requestFailedOffline = true) }

    private fun load() {
        reading?.cancel()
        reading = viewModelScope.launch { read() }
    }

    private suspend fun read() {
        val response = try {
            apis.sessions.getSession(workspaceId, sessionId)
        } catch (_: IOException) {
            _state.update { it.copy(requestFailedOffline = true) }
            return failed()
        } catch (_: SerializationException) {
            return failed()
        }
        val fresh = response.body()?.takeIf { response.isSuccessful }
        when {
            fresh != null -> _state.update {
                val current = it.session
                it.copy(
                    load = SessionLoad.Loaded,
                    session = fresh,
                    requestFailedOffline = false,
                    moved = if (current != null && current.version != fresh.version) null else it.moved,
                )
            }

            response.code() == HTTP_FORBIDDEN || response.code() == HTTP_NOT_FOUND -> {
                if (response.code() == HTTP_FORBIDDEN) onNotAllowed(response)
                _state.update { it.copy(load = SessionLoad.NoPermission) }
            }

            else -> failed()
        }
        if (fresh != null) readViewer(fresh)
    }

    private fun failed() = _state.update {
        if (it.load ==
            SessionLoad.Loaded
        ) {
            it
        } else {
            it.copy(load = SessionLoad.Failed)
        }
    }

    // The workspace's defaults and the client's language: both only to word the screen, so a failure here changes
    // nothing.
    private suspend fun readViewer(session: Session) {
        _state.update { it.copy(workspace = apis.workspaces.defaultsOf(workspaceId)) }
        val clientId = session.participants.firstOrNull()?.clientId ?: return
        if (_state.value.clientRecord?.id == clientId) return
        val record = try {
            apis.clients.getClient(workspaceId, clientId).let { found -> found.body()?.takeIf { found.isSuccessful } }
        } catch (_: IOException) {
            null
        } catch (_: SerializationException) {
            null
        }
        _state.update { it.copy(clientRecord = record ?: it.clientRecord) }
    }
}

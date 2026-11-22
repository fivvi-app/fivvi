package app.fivvi.pro.personal

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fivvi.api.apis.TrainersApi
import app.fivvi.api.apis.WorkspacesApi
import app.fivvi.api.models.WorkspaceDay
import app.fivvi.pro.sessions.SessionLoadException
import app.fivvi.pro.sessions.SessionTeam
import java.io.IOException
import java.net.HttpURLConnection.HTTP_FORBIDDEN
import java.time.Instant
import java.time.ZoneId
import java.util.UUID
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.SerializationException

/** The two sides of the Owner's control on Vandaag. */
enum class StudioScope { Mine, Studio }

/** What the control and *Hele studio* hold. */
data class StudioState(
    /** The workspace the app shows, once known. */
    val workspaceId: UUID? = null,
    /** The API lists `calendar.manage` for the person in this workspace (the capability helper decides). */
    val canManage: Boolean = false,
    /** How many people train in the workspace, once read; `null` until then and while it can't be read. */
    val trainerCount: Int? = null,
    val scope: StudioScope = StudioScope.Mine,
    val load: TodayLoad = TodayLoad.Loading,
    /** The workspace's day on screen, today's. */
    val day: WorkspaceDay? = null,
    /** The day on screen is the last answer, because the connection failed. */
    val isOffline: Boolean = false,
    /** A read failed for another reason than the connection and the day on screen stays. */
    val updateFailed: Boolean = false,
) {
    /** *Mijn dag | Hele studio* shows: the person may manage the calendar and the workspace has a team, more than one trainer. */
    val showsToggle: Boolean get() = canManage && workspaceId != null && (trainerCount ?: 0) > 1

    val isStudio: Boolean get() = showsToggle && scope == StudioScope.Studio

    /** *Vandaag kon niet worden bijgewerkt.*: the day on screen stays, or there is none. */
    val showsFailure: Boolean get() = updateFailed || (load == TodayLoad.Failed && !isOffline)
}

/**
 * The Owner's *Mijn dag | Hele studio* on Vandaag (F014 AC11, the design of `DECISIONS.md` §3, Android): the control, and the
 * workspace's day read-only from `GET /v1/workspaces/{id}/day` through the generated client. The API decides the day, the
 * busiest moment and who may read it (`calendar.manage`); [StudioContent] words them. The control shows by the ticket's
 * rule: the person has `calendar.manage` here and the workspace has a team, which `GET …/trainers` answers; whether the Owner
 * trains too doesn't matter. A solo PT and a Trainer have no control and no studio view. The day is asked for with no date,
 * which is today on the workspace's wall clock; a day on screen that is not today is read again when the studio is chosen.
 *
 * A `403` of the day hides the control at once and is told to [onForbidden], which has the capability helper read the
 * account again.
 */
class StudioDayViewModel(
    private val workspaces: WorkspacesApi,
    private val trainers: TrainersApi,
    private val clock: () -> Instant = Instant::now,
    private val onForbidden: (UUID) -> Unit = {},
) : ViewModel() {
    private val _state = MutableStateFlow(StudioState())
    val state: StateFlow<StudioState> = _state.asStateFlow()
    private var loading: Job? = null

    /** The time now on the model's clock, for the now-line and the next card as time passes. */
    fun now(): Instant = clock()

    /**
     * The workspace the app shows and whether the person may manage its calendar. Another workspace is another day: what was
     * read for the last one goes, and the control is Mijn dag again.
     */
    fun configure(workspaceId: UUID?, canManage: Boolean) {
        val before = _state.value
        if (before.workspaceId != workspaceId || before.canManage != canManage) {
            loading?.cancel()
            _state.value = StudioState(workspaceId = workspaceId, canManage = canManage)
        }
        readTrainers()
    }

    fun select(scope: StudioScope) {
        if (!_state.value.showsToggle) return
        _state.update { it.copy(scope = scope) }
        if (scope == StudioScope.Studio && !isToday(_state.value.day)) {
            // A day that is not today is not shown as today: it goes while today is read.
            _state.update { it.copy(day = null, load = TodayLoad.Loading, isOffline = false, updateFailed = false) }
            load()
        }
    }

    /** The day read is today on the workspace's wall clock, as the API sent it. */
    private fun isToday(day: WorkspaceDay?): Boolean {
        if (day == null) return false
        val zone = runCatching { ZoneId.of(day.timeZone) }.getOrNull() ?: return false
        return day.date == clock().atZone(zone).toLocalDate().toString()
    }

    /** Pull to refresh, the foreground, *Opnieuw*: who trains, and the day when the studio is on screen. */
    fun refresh() {
        readTrainers()
        if (_state.value.isStudio) load()
    }

    /** `GET …/trainers`: who trains here. A read that fails leaves what was known. */
    private fun readTrainers() {
        val state = _state.value
        val id = state.workspaceId ?: return
        if (!state.canManage) return
        viewModelScope.launch {
            val read = try {
                SessionTeam.read(trainers, id)
            } catch (_: SessionLoadException) {
                return@launch
            }
            if (_state.value.workspaceId == id) _state.update { it.copy(trainerCount = read.size) }
        }
    }

    /** Reads today in the workspace again. */
    fun load() {
        val id = _state.value.workspaceId ?: return
        loading?.cancel()
        loading = viewModelScope.launch { read(id) }
    }

    private suspend fun read(id: UUID) {
        val response = try {
            workspaces.getWorkspaceDay(id)
        } catch (_: IOException) {
            return failed(id, offline = true)
        } catch (_: SerializationException) {
            return failed(id, offline = false)
        }
        if (_state.value.workspaceId != id) return
        if (response.code() == HTTP_FORBIDDEN) return forbidden(id)
        val day = response.body()?.takeIf { response.isSuccessful } ?: return failed(id, offline = false)
        _state.update {
            it.copy(load = TodayLoad.Loaded, day = day, isOffline = false, updateFailed = false)
        }
    }

    private fun failed(id: UUID, offline: Boolean) {
        if (_state.value.workspaceId != id) return
        _state.update {
            if (it.day == null) {
                it.copy(load = TodayLoad.Failed, isOffline = offline, updateFailed = false)
            } else {
                it.copy(isOffline = offline, updateFailed = !offline)
            }
        }
    }

    /** The API refused the day: no control and no studio view, and the capability helper hears it. */
    private fun forbidden(id: UUID) {
        _state.value = StudioState(workspaceId = id, canManage = false)
        onForbidden(id)
    }
}

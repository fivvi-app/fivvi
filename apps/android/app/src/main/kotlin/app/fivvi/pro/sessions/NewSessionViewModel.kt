package app.fivvi.pro.sessions

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fivvi.api.models.Client
import app.fivvi.api.models.Locale
import app.fivvi.api.models.PlanPrivateSessionRequest
import app.fivvi.api.models.Session
import app.fivvi.api.models.Trainer
import app.fivvi.pro.clients.WorkspaceDefaults
import app.fivvi.pro.clients.defaultsOf
import java.io.IOException
import java.net.HttpURLConnection.HTTP_CONFLICT
import java.net.HttpURLConnection.HTTP_FORBIDDEN
import java.net.HttpURLConnection.HTTP_NOT_FOUND
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.OffsetDateTime
import java.util.UUID
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.SerializationException
import retrofit2.Response

sealed interface NewSessionLoad {
    data object Loading : NewSessionLoad

    data object Ready : NewSessionLoad

    /** The API answered, but not with what the form needs. */
    data object Failed : NewSessionLoad

    /** The API couldn't be reached. */
    data object Offline : NewSessionLoad

    /** The API refused the workspace's data: the person has no access (any more). */
    data object NoPermission : NewSessionLoad
}

/** What went wrong with a save that the fields don't show. */
enum class SaveFailure { NoPermission, NotSaved }

/** What PS-04 shows and holds. */
data class NewSessionState(
    val load: NewSessionLoad = NewSessionLoad.Loading,
    val workspace: WorkspaceDefaults = WorkspaceDefaults(),
    val client: Client? = null,
    val notify: Boolean = true,
    /** The trainer an Owner chose (the team-member ID); a Trainer plans for themself and sends none. */
    val trainerId: UUID? = null,
    val time: SessionTime = SessionTime(LocalDateTime.MIN),
    val trainers: List<Trainer> = emptyList(),
    /** The team-member ID of the person among the trainers, once read. */
    val myTrainerId: UUID? = null,
    val locationName: String = "",
    val clientMissing: Boolean = false,
    val trainerMissing: Boolean = false,
    val saveFailure: SaveFailure? = null,
    /** PS-07: the trainer has something else then (`409` `trainer_conflict`); nothing was stored. */
    val doubleBooking: DoubleBooking? = null,
    val saving: Boolean = false,
    /** A request failed for lack of a connection: the next successful read clears it. */
    val sawOffline: Boolean = false,
    /** The API planned this session: PS-04 closes and TD-02 of it opens. */
    val saved: Session? = null,
    internal val firstStart: LocalDateTime = LocalDateTime.MIN,
    private val forAnyTrainer: Boolean = false,
) {
    /** With no connection the form says so, and *Opslaan* is off. */
    val isOffline: Boolean get() = load == NewSessionLoad.Offline || sawOffline

    val canSave: Boolean get() = load == NewSessionLoad.Ready && !isOffline && !saving

    /** Something was entered: leaving asks first. */
    val isDirty: Boolean
        get() = client != null || time.start != firstStart || time.durationMinutes != DEFAULT_MINUTES || !notify ||
            (forAnyTrainer && trainerId != myTrainerId)

    /** Where the session ends, for *Eindigt om…*. */
    val endsAt: SessionClock.End get() = SessionClock.end(time.start, time.durationMinutes, workspace.zone)

    /** The language the confirmation goes out in: the client's own, else the workspace's default. */
    val emailLocale: Locale
        get() = when (client?.emailLocale) {
            Client.EmailLocale.EN -> Locale.EN
            Client.EmailLocale.NL_NL -> Locale.NL_NL
            null -> workspace.defaultLocale
        }

    companion object {
        const val DEFAULT_MINUTES = 60
    }
}

/**
 * PS-04 *Nieuwe privésessie* (F020 AC1, AC2, AC10): a client, a date, a start, a length, the trainer, the location and
 * whether the client gets the confirmation. The API plans it (`POST …/sessions/private`) and decides every rule; the form
 * only collects, shows what the API refused and keeps what was typed. Planning needs a connection: when a request couldn't
 * reach the API the form says so and *Opslaan* is off, and nothing is queued; [start] reads again.
 *
 * [forAnyTrainer] is the Owner's right to plan for any trainer (`session.private.manage.any`); a Trainer plans for
 * themself and sends no trainer. [onNotAllowed] is told a 403 of the plan, for the capability helper (F004 AC10). [start] is
 * the first start the form shows instead of the next full hour (*Plannen* on Vandaag, F013).
 */
class NewSessionViewModel(
    private val apis: SessionApis,
    private val workspaceId: UUID,
    private val forAnyTrainer: Boolean,
    private val teamMemberId: UUID,
    private val onNotAllowed: (Response<*>) -> Unit = {},
    private val now: () -> Instant = Instant::now,
    private val start: OffsetDateTime? = null,
) : ViewModel() {
    private val _state = MutableStateFlow(NewSessionState(forAnyTrainer = forAnyTrainer))
    val state: StateFlow<NewSessionState> = _state.asStateFlow()
    private var reading: Job? = null

    init {
        start()
    }

    /** Reads what the form shows around its fields: the workspace, the default location and, for an Owner, the trainers. */
    fun start() {
        reading?.cancel()
        _state.update { it.copy(load = NewSessionLoad.Loading, sawOffline = false) }
        reading = viewModelScope.launch { read() }
    }

    private suspend fun read() {
        try {
            val workspace = apis.workspaces.defaultsOf(workspaceId)
            val locations = apis.locations.listLocations(workspaceId)
            val places = locations.body()?.takeIf { locations.isSuccessful }
            if (places == null) {
                val gone = locations.code() == HTTP_FORBIDDEN || locations.code() == HTTP_NOT_FOUND
                return finish { it.copy(load = if (gone) NewSessionLoad.NoPermission else NewSessionLoad.Failed) }
            }
            val place = places.firstOrNull { it.isDefault } ?: places.firstOrNull()
                ?: return finish { it.copy(load = NewSessionLoad.Failed) }
            val trainers = if (forAnyTrainer) SessionTeam.read(apis.trainers, workspaceId) else null
            val mine = trainers?.let { SessionTeam.myTrainerId(it, teamMemberId) }
            // *Plannen* on Vandaag hands over the start of the free gap; otherwise the next full hour.
            val first =
                start?.let { SessionClock.local(it, workspace.zone) }
                    ?: SessionClock.nextFullHour(now(), workspace.zone)
            finish {
                it.copy(
                    load = NewSessionLoad.Ready,
                    workspace = workspace,
                    locationName = place.name,
                    trainers = trainers.orEmpty(),
                    myTrainerId = mine,
                    trainerId = it.trainerId ?: mine,
                    // What was entered before a read again stays; a first read sets the first start.
                    time = if (it.time.start == LocalDateTime.MIN) SessionTime(first) else it.time,
                    firstStart = if (it.firstStart == LocalDateTime.MIN) first else it.firstStart,
                )
            }
        } catch (_: IOException) {
            finish { it.copy(load = NewSessionLoad.Offline) }
        } catch (_: SerializationException) {
            finish { it.copy(load = NewSessionLoad.Failed) }
        } catch (error: SessionLoadException) {
            finish {
                it.copy(
                    load = when (error.error) {
                        SessionLoadError.Gone -> NewSessionLoad.NoPermission
                        SessionLoadError.Offline -> NewSessionLoad.Offline
                        SessionLoadError.Failed -> NewSessionLoad.Failed
                    },
                )
            }
        }
    }

    private fun finish(change: (NewSessionState) -> NewSessionState) = _state.update(change)

    fun chooseClient(client: Client) = _state.update { it.copy(client = client, clientMissing = false) }

    fun setNotify(notify: Boolean) = _state.update { it.copy(notify = notify) }

    fun setTrainer(id: UUID) = _state.update { it.copy(trainerId = id, trainerMissing = false) }

    fun setDate(date: LocalDate) = _state.update { it.copy(time = it.time.withDate(date)) }

    fun setStart(time: LocalTime) = _state.update { it.copy(time = it.time.withTime(time)) }

    /** A button's length, or [OTHER] for *Andere duur*. */
    fun chooseDuration(choice: Int) = _state.update { it.copy(time = it.time.chooseDuration(choice)) }

    fun setOtherDuration(minutes: Int) = _state.update { it.copy(time = it.time.withOtherDuration(minutes)) }

    /** The planned session was handed on: it isn't handed on again. */
    fun onSavedHandled() = _state.update { it.copy(saved = null) }

    /** *Terug* of PS-07: the warning goes, the form stays as it is and nothing is sent. */
    fun dismissDoubleBooking() = _state.update { it.copy(doubleBooking = null) }

    /**
     * Plans the session. When the API saved it, [NewSessionState.saved] has it; otherwise the state says what went wrong.
     * [allowConflicts] is *Toch opslaan* of PS-07: the same request again, saved even when the trainer has something then.
     */
    fun save(allowConflicts: Boolean = false) {
        val shown = _state.value
        if (!shown.canSave) return
        val client = shown.client
        val trainerMissing = forAnyTrainer && shown.trainerId == null
        _state.update {
            it.copy(
                saveFailure = null,
                doubleBooking = null,
                time = it.time.cleared(),
                clientMissing = client == null,
                trainerMissing = trainerMissing,
            )
        }
        if (client == null || trainerMissing) return
        _state.update { it.copy(saving = true) }
        val request = PlanPrivateSessionRequest(
            clientId = client.id,
            localDate = SessionClock.localDate(shown.time.start),
            localStart = SessionClock.localStart(shown.time.start),
            durationMinutes = shown.time.durationMinutes,
            notify = shown.notify,
            trainerId = shown.trainerId.takeIf { forAnyTrainer },
            allowConflicts = true.takeIf { allowConflicts },
            surface = PlanPrivateSessionRequest.Surface.ANDROID,
        )
        viewModelScope.launch { send(request) }
    }

    private suspend fun send(request: PlanPrivateSessionRequest) {
        val response = try {
            apis.sessions.createPrivateSession(workspaceId, request)
        } catch (_: IOException) {
            return _state.update { it.copy(saving = false, sawOffline = true) }
        } catch (_: SerializationException) {
            return _state.update { it.copy(saving = false, saveFailure = SaveFailure.NotSaved) }
        }
        val planned = response.body()?.takeIf { response.isSuccessful }
        if (planned != null) return _state.update { it.copy(saving = false, saved = planned.session) }
        val refused = _state.value.time.refusedBy(response)
        when {
            refused != null -> _state.update { it.copy(saving = false, time = refused) }

            response.code() == HTTP_CONFLICT -> {
                val conflicts = DoubleBooking.conflictsOf(response.errorBody()?.string())
                _state.update {
                    val booking = DoubleBooking.of(conflicts, it.chosenTrainerName())
                    if (booking != null) {
                        it.copy(saving = false, doubleBooking = booking)
                    } else {
                        it.copy(saving = false, saveFailure = SaveFailure.NotSaved)
                    }
                }
            }

            response.code() == HTTP_FORBIDDEN -> {
                onNotAllowed(response)
                _state.update { it.copy(saving = false, saveFailure = SaveFailure.NoPermission) }
            }

            else -> _state.update { it.copy(saving = false, saveFailure = SaveFailure.NotSaved) }
        }
    }

    // The trainer the warning names: `null` for the person themself (*Je hebt dan al iets*).
    private fun NewSessionState.chosenTrainerName(): String? {
        if (!forAnyTrainer || trainerId == myTrainerId) return null
        return trainers.firstOrNull { it.id == trainerId }?.name
    }

    companion object {
        /** The segmented control's value for *Andere duur*. */
        const val OTHER = SessionTime.OTHER
    }
}

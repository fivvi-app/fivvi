package app.fivvi.pro.classes

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fivvi.api.infrastructure.Serializer
import app.fivvi.api.models.CreateGroupClassRequest
import app.fivvi.api.models.CreatedGroupClass
import app.fivvi.api.models.FirstGroupClassDate
import app.fivvi.api.models.Session
import app.fivvi.api.models.Trainer
import app.fivvi.api.models.ValidationError
import app.fivvi.api.models.ValidationErrorIssuesInner
import app.fivvi.pro.clients.WorkspaceDefaults
import app.fivvi.pro.clients.defaultsOf
import app.fivvi.pro.sessions.DoubleBooking
import app.fivvi.pro.sessions.NewSessionLoad
import app.fivvi.pro.sessions.SaveFailure
import app.fivvi.pro.sessions.SessionClock
import app.fivvi.pro.sessions.SessionLoadError
import app.fivvi.pro.sessions.SessionLoadException
import app.fivvi.pro.sessions.SessionTeam
import app.fivvi.pro.sessions.SessionTime
import java.io.IOException
import java.net.HttpURLConnection.HTTP_BAD_REQUEST
import java.net.HttpURLConnection.HTTP_CONFLICT
import java.net.HttpURLConnection.HTTP_FORBIDDEN
import java.net.HttpURLConnection.HTTP_NOT_FOUND
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.util.UUID
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.SerializationException
import kotlinx.serialization.decodeFromString
import retrofit2.Response

/** The fields the API names in a `400`. */
enum class ClassField { NameNl, NameEn, DescriptionNl, DescriptionEn, Capacity, Duration }

/** What TD-05 shows and holds. */
data class NewGroupClassState(
    val load: NewSessionLoad = NewSessionLoad.Loading,
    val workspace: WorkspaceDefaults = WorkspaceDefaults(),
    val nameNl: String = "",
    val nameEn: String = "",
    val descriptionNl: String = "",
    val descriptionEn: String = "",
    val capacity: Int = NewGroupClassViewModel.DEFAULT_CAPACITY,
    /** The trainer chosen (the team-member ID); `null` is *Trainer nodig*. */
    val trainerId: UUID? = null,
    /** The date, the start and the length; the end is the start plus the length. */
    val time: SessionTime = SessionTime(LocalDateTime.MIN),
    val trainers: List<Trainer> = emptyList(),
    /** The team-member ID of the person among the trainers, once read. */
    val myTrainerId: UUID? = null,
    val locationName: String = "",
    /** What the API refused per field: the issue's code. */
    val refused: Map<ClassField, String> = emptyMap(),
    val saveFailure: SaveFailure? = null,
    /** PS-07: the trainer has something else then (`409` `trainer_conflict`); nothing was stored. */
    val doubleBooking: DoubleBooking? = null,
    val saving: Boolean = false,
    /** A request failed for lack of a connection: the next successful read clears it. */
    val sawOffline: Boolean = false,
    /** The API created the class and its date: TD-05 closes and TD-03 of the date opens. */
    val saved: Session? = null,
    internal val firstStart: LocalDateTime = LocalDateTime.MIN,
) {
    /** With no connection the form says so, and *Opslaan* is off. */
    val isOffline: Boolean get() = load == NewSessionLoad.Offline || sawOffline

    val canSave: Boolean get() = load == NewSessionLoad.Ready && !isOffline && !saving

    /** Something was entered: leaving asks first. */
    val isDirty: Boolean
        get() = (nameNl + nameEn + descriptionNl + descriptionEn).isNotEmpty() ||
            capacity != NewGroupClassViewModel.DEFAULT_CAPACITY || time.start != firstStart ||
            time.durationMinutes != NewGroupClassViewModel.DEFAULT_MINUTES || trainerId != myTrainerId

    /** Where the class ends: the start plus the length. */
    val endsAt: LocalTime
        get() = time.start.plusMinutes(time.durationMinutes.toLong()).toLocalTime()
}

/**
 * TD-05 *Nieuwe groepsles* (F021 AC6, the Owner, *Herhalen: Niet herhalen*): the name and the description in Dutch and
 * English, the date, the start and the end, the capacity, the trainer (or *Trainer nodig*) and the default location. The
 * API creates the class and its one date in one request (`POST …/group-classes` with a `firstDate`, so a refused date
 * leaves no class behind) and decides every rule; the form only collects, shows what the API refused per field and keeps
 * what was typed. Without a connection the form says so and *Opslaan* is off; nothing is queued ([start] reads again).
 * [teamMemberId] is the person's own team-member ID in the workspace; [onNotAllowed] is told a 403 of the save, for the
 * capability helper (F004 AC10).
 */
class NewGroupClassViewModel(
    private val apis: ClassApis,
    private val workspaceId: UUID,
    private val teamMemberId: UUID,
    private val onNotAllowed: (Response<*>) -> Unit = {},
    private val now: () -> Instant = Instant::now,
) : ViewModel() {
    private val _state = MutableStateFlow(NewGroupClassState())
    val state: StateFlow<NewGroupClassState> = _state.asStateFlow()
    private var reading: Job? = null

    init {
        start()
    }

    /** Reads what the form shows around its fields: the workspace, the default location and the trainers. */
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
            val trainers = SessionTeam.read(apis.trainers, workspaceId)
            val mine = SessionTeam.myTrainerId(trainers, teamMemberId)
            val first = SessionClock.nextFullHour(now(), workspace.zone)
            finish {
                it.copy(
                    load = NewSessionLoad.Ready,
                    workspace = workspace,
                    locationName = place.name,
                    trainers = trainers,
                    myTrainerId = mine,
                    // The person teaches the class unless they chose someone else; with no profile, *Trainer nodig*.
                    trainerId = it.trainerId?.takeIf { chosen -> trainers.any { trainer -> trainer.id == chosen } }
                        ?: mine,
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

    private fun finish(change: (NewGroupClassState) -> NewGroupClassState) = _state.update(change)

    fun setNameNl(text: String) = _state.update { it.copy(nameNl = text, refused = it.refused - ClassField.NameNl) }

    fun setNameEn(text: String) = _state.update { it.copy(nameEn = text, refused = it.refused - ClassField.NameEn) }

    fun setDescriptionNl(text: String) =
        _state.update { it.copy(descriptionNl = text, refused = it.refused - ClassField.DescriptionNl) }

    fun setDescriptionEn(text: String) =
        _state.update { it.copy(descriptionEn = text, refused = it.refused - ClassField.DescriptionEn) }

    /** The capacity, kept between the API's own limits so the stepper can't leave them. */
    fun setCapacity(capacity: Int) = _state.update {
        it.copy(capacity = capacity.coerceIn(CAPACITIES), refused = it.refused - ClassField.Capacity)
    }

    /** `null` is *Trainer nodig*. */
    fun setTrainer(id: UUID?) = _state.update { it.copy(trainerId = id) }

    fun setDate(date: LocalDate) = _state.update { it.copy(time = it.time.withDate(date)) }

    fun setStart(time: LocalTime) = _state.update { it.copy(time = it.time.withTime(time)) }

    /** The end the person picked, on the day of the start. A time before the start is kept and refused by the API. */
    fun setEnd(end: LocalTime) = _state.update {
        it.copy(time = it.time.withEnd(end), refused = it.refused - ClassField.Duration)
    }

    /** The created date was handed on: it isn't handed on again. */
    fun onSavedHandled() = _state.update { it.copy(saved = null) }

    /** *Terug* of PS-07: the warning goes, the form stays as it is and nothing is sent. */
    fun dismissDoubleBooking() = _state.update { it.copy(doubleBooking = null) }

    /**
     * Creates the class with its date. When the API stored it, [NewGroupClassState.saved] has the date; otherwise the state
     * says what went wrong. [allowConflicts] is *Toch opslaan* of PS-07: the same request again.
     */
    fun save(allowConflicts: Boolean = false) {
        val shown = _state.value
        if (!shown.canSave) return
        _state.update {
            it.copy(
                saveFailure = null,
                doubleBooking = null,
                refused = emptyMap(),
                time = it.time.cleared(),
                saving = true,
            )
        }
        val request = CreateGroupClassRequest(
            nameNl = shown.nameNl.trim(),
            capacity = shown.capacity,
            durationMinutes = shown.time.durationMinutes,
            nameEn = shown.nameEn.trimmedOrNull(),
            descriptionNl = shown.descriptionNl.trimmedOrNull(),
            descriptionEn = shown.descriptionEn.trimmedOrNull(),
            trainerId = shown.trainerId,
            allowConflicts = true.takeIf { allowConflicts },
            firstDate = FirstGroupClassDate(
                localDate = SessionClock.localDate(shown.time.start),
                localStart = SessionClock.localStart(shown.time.start),
            ),
            surface = CreateGroupClassRequest.Surface.ANDROID,
        )
        viewModelScope.launch { send(request) }
    }

    private suspend fun send(request: CreateGroupClassRequest) {
        val response = try {
            apis.classes.createGroupClass(workspaceId, request)
        } catch (_: IOException) {
            return _state.update { it.copy(saving = false, sawOffline = true) }
        } catch (_: SerializationException) {
            return _state.update { it.copy(saving = false, saveFailure = SaveFailure.NotSaved) }
        }
        val created: CreatedGroupClass? = response.body()?.takeIf { response.isSuccessful }
        if (created != null) {
            val date = created.firstDate
            return _state.update {
                if (date != null) {
                    it.copy(saving = false, saved = date)
                } else {
                    it.copy(saving = false, saveFailure = SaveFailure.NotSaved)
                }
            }
        }
        when (response.code()) {
            HTTP_BAD_REQUEST -> refuse(response)

            HTTP_CONFLICT -> {
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

            HTTP_FORBIDDEN -> {
                onNotAllowed(response)
                _state.update { it.copy(saving = false, saveFailure = SaveFailure.NoPermission) }
            }

            else -> _state.update { it.copy(saving = false, saveFailure = SaveFailure.NotSaved) }
        }
    }

    // The `400` of the API: each issue names the field it is about.
    private fun refuse(response: Response<*>) {
        val issues = runCatching {
            Serializer.kotlinxSerializationJson.decodeFromString<ValidationError>(
                response.errorBody()?.string().orEmpty(),
            )
                .issues
        }.getOrNull().orEmpty()
        _state.update { shown ->
            val time = shown.time.refusedBy(issues)
            val refused = issues.mapNotNull { issue -> fieldOf(issue)?.let { it to issue.code } }.toMap()
            shown.copy(
                saving = false,
                time = time ?: shown.time,
                refused = refused,
                saveFailure = SaveFailure.NotSaved.takeIf { refused.isEmpty() && time == null },
            )
        }
    }

    private fun fieldOf(issue: ValidationErrorIssuesInner): ClassField? = when (issue.path) {
        "nameNl" -> ClassField.NameNl
        "nameEn" -> ClassField.NameEn
        "descriptionNl" -> ClassField.DescriptionNl
        "descriptionEn" -> ClassField.DescriptionEn
        "capacity" -> ClassField.Capacity
        "durationMinutes" -> ClassField.Duration
        else -> null
    }

    // The trainer the warning names: `null` for the person themself (*Je hebt dan al iets*).
    private fun NewGroupClassState.chosenTrainerName(): String? {
        if (trainerId == null || trainerId == myTrainerId) return null
        return trainers.firstOrNull { it.id == trainerId }?.name
    }

    companion object {
        const val DEFAULT_CAPACITY = 12
        const val DEFAULT_MINUTES = 60

        /** The API's limits (`packages/contract`): the names at most 80, the descriptions at most 500, capacity 1 to 100. */
        const val NAME_MAX = 80
        const val DESCRIPTION_MAX = 500
        val CAPACITIES = 1..100

        /** A length of 15 to 240 minutes in steps of 5; they only fill the refusal texts. */
        val DURATIONS = 15..240
        const val DURATION_STEP = 5
    }
}

// The text, or `null` when it is blank: a blank text means none.
private fun String.trimmedOrNull(): String? = trim().ifEmpty { null }

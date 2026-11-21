package app.fivvi.pro.classes

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fivvi.api.models.GroupClass
import app.fivvi.api.models.Session
import app.fivvi.api.models.SessionParticipant
import app.fivvi.api.models.SessionSeries
import app.fivvi.pro.clients.WorkspaceDefaults
import app.fivvi.pro.clients.defaultsOf
import java.io.IOException
import java.net.HttpURLConnection.HTTP_FORBIDDEN
import java.net.HttpURLConnection.HTTP_NOT_FOUND
import java.time.DayOfWeek
import java.util.UUID
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.SerializationException
import retrofit2.Response

sealed interface ClassDateLoad {
    data object Loading : ClassDateLoad

    data object Loaded : ClassDateLoad

    data object Failed : ClassDateLoad

    /** The API refused this date (the team access is gone, or it is not in the workspace). */
    data object NoPermission : ClassDateLoad
}

/** A text of a class in the viewer's language, or the Dutch one when there is none; [isDutchFallback] marks that. */
data class ClassText(val text: String, val isDutchFallback: Boolean)

/** *Onderdeel van: {name}, elke {weekday} {time}*: what the line of a date in a weekly series says (F022 AC6). */
data class SeriesLine(val name: String, val time: String, val weekday: DayOfWeek)

/** What TD-03 shows and holds. */
data class ClassDateState(
    /** The person's own team-member ID in the workspace (`GET /api/v1/me`): a date whose trainer has it reads *Jij*. */
    val myTeamMemberId: UUID,
    /** The person has `class.manage`: they get the ⋯ menu and the footnote. */
    val canManage: Boolean,
    /**
     * TD-05 has just created this date and this many dates (12 for a weekly class, else 1): "Groepsles toegevoegd" or
     * "12 groepslessen toegevoegd" shows; `null` for a date opened from the calendar.
     */
    val added: Int? = null,
    val load: ClassDateLoad = ClassDateLoad.Loading,
    val session: Session? = null,
    /** The class itself, for the description (the date has none); `null` until read, or when it can't be. */
    val groupClass: GroupClass? = null,
    val workspace: WorkspaceDefaults = WorkspaceDefaults(),
    val descriptionOpen: Boolean = false,
    /** *Les wijzigen* was chosen: the screen says the class is managed on the web. */
    val manageOnWeb: Boolean = false,
) {
    /** The places taken: the clients who have not cancelled. */
    val booked: Int
        get() = session?.participants?.count { it.attendanceStatus != SessionParticipant.AttendanceStatus.CANCELLED }
            ?: 0

    val capacity: Int get() = session?.capacity ?: 0
    val free: Int get() = maxOf(0, capacity - booked)
    val showsNoBookings: Boolean get() = booked == 0
    val trainerIsMe: Boolean get() = session?.trainer?.id.let { it != null && it == myTeamMemberId }

    /** The Owner's menu; a Trainer who is not substituting has none (F024 adds the substitute's). */
    val hasMenu: Boolean get() = canManage

    /** The class's name in the viewer's language: the English name for an English viewer and a class that has one. */
    fun title(english: Boolean): String {
        val named = session?.groupClass ?: return ""
        return pick(english, named.nameNl, named.nameEn)?.text ?: named.nameNl
    }

    /** The series line of a date in a weekly series, from the series the API sends with the date; `null` for a date on its own. */
    fun seriesLine(english: Boolean): SeriesLine? {
        val series = session?.series ?: return null
        return SeriesLine(title(english), series.localStartTime, series.weekday.dayOfWeek())
    }

    /** The description in the viewer's language, else Dutch (marked as Dutch); `null` when the class has none to show. */
    fun description(english: Boolean): ClassText? =
        groupClass?.let { pick(english, it.descriptionNl, it.descriptionEn) }

    companion object {
        /**
         * The text of a class in the viewer's language, else Dutch (`pickContentLanguage`); never translated. A blank text
         * is none.
         */
        fun pick(english: Boolean, dutch: String?, englishText: String?): ClassText? {
            if (english && !englishText.isNullOrEmpty()) return ClassText(englishText, false)
            if (dutch.isNullOrEmpty()) return null
            return ClassText(dutch, english)
        }
    }
}

/**
 * TD-03 *Groepsles* (F021 AC3, AC5, AC7 and the design of `DECISIONS.md` §3): a class on a date as everyone on the team
 * reads it. Read from `GET …/sessions/{id}` and, for the description, `GET …/group-classes/{id}` through the generated
 * client; what is shown stays when a later read fails. Bookings and attendance come with M5 and F025. [onNotAllowed] is told
 * a 403, for the capability helper (F004 AC10).
 */
class ClassDateViewModel(
    private val apis: ClassApis,
    private val workspaceId: UUID,
    private val sessionId: UUID,
    teamMemberId: UUID,
    canManage: Boolean,
    added: Int? = null,
    private val onNotAllowed: (Response<*>) -> Unit = {},
) : ViewModel() {
    private val _state = MutableStateFlow(ClassDateState(teamMemberId, canManage, added))
    val state: StateFlow<ClassDateState> = _state.asStateFlow()
    private var reading: Job? = null

    init {
        load()
    }

    fun retry() {
        _state.update { it.copy(load = ClassDateLoad.Loading) }
        load()
    }

    /** The screen is shown again: read the date again and leave what is on screen until the answer is there. */
    fun refresh() = load()

    fun toggleDescription() = _state.update { it.copy(descriptionOpen = !it.descriptionOpen) }

    /** *Les wijzigen*: the class is managed on the web, and the screen says so. */
    fun editTapped() = _state.update { it.copy(manageOnWeb = true) }

    private fun load() {
        reading?.cancel()
        reading = viewModelScope.launch { read() }
    }

    private suspend fun read() {
        val response = try {
            apis.sessions.getSession(workspaceId, sessionId)
        } catch (_: IOException) {
            return failed()
        } catch (_: SerializationException) {
            return failed()
        }
        val fresh = response.body()?.takeIf { response.isSuccessful }
        when {
            fresh != null -> _state.update { it.copy(load = ClassDateLoad.Loaded, session = fresh) }

            response.code() == HTTP_FORBIDDEN || response.code() == HTTP_NOT_FOUND -> {
                if (response.code() == HTTP_FORBIDDEN) onNotAllowed(response)
                _state.update { it.copy(load = ClassDateLoad.NoPermission) }
            }

            else -> failed()
        }
        if (fresh != null) readViewer(fresh)
    }

    private fun failed() = _state.update {
        if (it.load == ClassDateLoad.Loaded) it else it.copy(load = ClassDateLoad.Failed)
    }

    // The workspace's defaults and the class's description: both only to word the screen, so a failure here changes
    // nothing.
    private suspend fun readViewer(session: Session) {
        _state.update { it.copy(workspace = apis.workspaces.defaultsOf(workspaceId)) }
        val classId = session.groupClass?.id ?: return
        val found = try {
            apis.classes.getGroupClass(workspaceId, classId).let { read -> read.body()?.takeIf { read.isSuccessful } }
        } catch (_: IOException) {
            null
        } catch (_: SerializationException) {
            null
        }
        _state.update { it.copy(groupClass = found ?: it.groupClass) }
    }
}

// The weekday a series names, as `java.time` has it.
private fun SessionSeries.Weekday.dayOfWeek(): DayOfWeek = when (this) {
    SessionSeries.Weekday.MO -> DayOfWeek.MONDAY
    SessionSeries.Weekday.TU -> DayOfWeek.TUESDAY
    SessionSeries.Weekday.WE -> DayOfWeek.WEDNESDAY
    SessionSeries.Weekday.TH -> DayOfWeek.THURSDAY
    SessionSeries.Weekday.FR -> DayOfWeek.FRIDAY
    SessionSeries.Weekday.SA -> DayOfWeek.SATURDAY
    SessionSeries.Weekday.SU -> DayOfWeek.SUNDAY
}

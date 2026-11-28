package app.fivvi.pro.classes

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fivvi.api.infrastructure.Serializer
import app.fivvi.api.models.CancelClassDateRefusal
import app.fivvi.api.models.CancelClassDateRequest
import app.fivvi.api.models.ClassLevel
import app.fivvi.api.models.CreateBookingLinkRequest
import app.fivvi.api.models.GroupClass
import app.fivvi.api.models.Session
import app.fivvi.api.models.SessionParticipant
import app.fivvi.api.models.SessionSeries
import app.fivvi.pro.clients.WorkspaceDefaults
import app.fivvi.pro.clients.defaultsOf
import java.io.IOException
import java.net.HttpURLConnection.HTTP_CONFLICT
import java.net.HttpURLConnection.HTTP_FORBIDDEN
import java.net.HttpURLConnection.HTTP_NOT_FOUND
import java.time.DayOfWeek
import java.time.Instant
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

/** What the confirmation of *Les annuleren* tells (CO-03, F026). */
data class CancelAsk(
    /** How many people get the cancellation email. */
    val participants: Int,
    /** The date has started: it is recorded for the record and nobody gets an email. */
    val started: Boolean,
)

/** What a cancellation that didn't happen says. */
sealed interface CancelFailure {
    /** Someone else changed the date first (`409`): [byName] is who, when the API knows. */
    data class Changed(val byName: String?) : CancelFailure

    data object Cancelled : CancelFailure

    data object NoPermission : CancelFailure

    data object NotSaved : CancelFailure
}

/** What a *Boekingslink delen* that didn't happen says (F037). Offline has its own line. */
enum class ShareFailure { NoPermission, NotShared }

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
    /** The phone's connection, from the network (`Connectivity`); the state of a model made without one says online. */
    val online: Boolean = true,
    /** The last read or cancellation couldn't reach the API: the fallback when the network said online. */
    val requestFailedOffline: Boolean = false,
    /** The confirmation of *Les annuleren*, once the API said who would get the email; `null` when it is not asked. */
    val cancelAsk: CancelAsk? = null,
    val cancelFailure: CancelFailure? = null,
    val isCancelling: Boolean = false,
    /** The person has `booking_link.copy` (the Owner and the Trainers): they get *Boekingslink delen* (F037). */
    val canShareLink: Boolean = false,
    /** The time the model last read the date at: a date that has started is told from one to come by it. */
    val now: Instant = Instant.EPOCH,
    /** A *Boekingslink delen* request is on its way. */
    val isSharing: Boolean = false,
    val shareFailure: ShareFailure? = null,
    /** *Toon alle {n}* was tapped: every participant is listed, not the first few. */
    val participantsOpen: Boolean = false,
    /** How many times the link was put on the clipboard: "Boekingslink gekopieerd" shows each time it goes up. */
    val copied: Int = 0,
) {
    /** The places taken: the clients who have not cancelled. */
    val booked: Int
        get() = session?.participants?.count { it.attendanceStatus != SessionParticipant.AttendanceStatus.CANCELLED }
            ?: 0

    /** The clients who hold a place, with the status the API has for each (F025): who the *Deelnemers* list names. */
    val participants: List<SessionParticipant>
        get() = session?.participants?.filter { it.attendanceStatus != SessionParticipant.AttendanceStatus.CANCELLED }
            .orEmpty()

    /** The first few participants, or all of them once *Toon alle* was tapped. */
    val shownParticipants: List<SessionParticipant>
        get() = if (participantsOpen) participants else participants.take(SHOWN_PARTICIPANTS)

    val showsAllButton: Boolean get() = !participantsOpen && participants.size > SHOWN_PARTICIPANTS

    /** *Aanwezigheid invullen* (CO-05) shows on a date that takes place; it is off until someone has a place on it. */
    val showsAttendance: Boolean get() = session != null && !isCancelled
    val canTakeAttendance: Boolean get() = booked > 0

    val capacity: Int get() = session?.capacity ?: 0
    val free: Int get() = maxOf(0, capacity - booked)
    val showsNoBookings: Boolean get() = booked == 0
    val trainerIsMe: Boolean get() = session?.trainer?.id.let { it != null && it == myTeamMemberId }

    val isCancelled: Boolean get() = session?.status == Session.Status.CANCELLED

    /** The level of this date (F067), the same for everyone on the team; `null` is *Geen*. */
    val level: ClassLevel? get() = session?.level

    /** The Owner's menu, until the date is cancelled; a Trainer has none, a covering one neither: only the Owner substitutes. */
    val hasMenu: Boolean get() = canManage && !isCancelled

    /** Whom the date's trainer replaces (F024), when the API says and gives a name. */
    private val originalTrainer: String? get() = session?.substituteFor?.name?.takeIf { it.isNotEmpty() }

    /** *Je valt in voor Sarah*, for the person who covers the date; `null` for everyone else. */
    val coveringFor: String? get() = originalTrainer.takeIf { trainerIsMe }

    /** *Mike (vervangt Sarah)*: whom the date's trainer replaces, for everyone but the one who covers it. */
    val replacedTrainer: String? get() = originalTrainer.takeIf { !trainerIsMe }

    /** *De trainer vervangen* is in the menu of a date that has a trainer to replace; it says it is managed on the web. */
    val showsSubstitute: Boolean get() = hasMenu && session?.trainer != null

    /** The Owner may cancel a date that is still planned (`class.manage`). */
    val canCancel: Boolean get() = canManage && session?.status == Session.Status.SCHEDULED

    /** *Les annuleren* is off: the network says offline, or the last read or cancellation couldn't reach the API. */
    val isOffline: Boolean get() = requestFailedOffline || !online

    /** *Les annuleren* is on while the phone is online (nothing is queued). */
    val canStartCancel: Boolean get() = canCancel && !isOffline && !isCancelling

    /**
     * The person may share this date's link: a group class date still to come, not cancelled (the API refuses a date that
     * has started, and a private session).
     */
    val showsShareLink: Boolean
        get() = canShareLink && session.let {
            it != null && it.type == Session.Type.GROUP && it.status == Session.Status.SCHEDULED &&
                it.startsAt.toInstant().isAfter(now)
        }

    /** *Boekingslink delen* is the first item of the Owner's ⋯ menu. */
    val showsShareLinkInMenu: Boolean get() = showsShareLink && hasMenu

    /** *Boekingslink delen* is on while the phone is online and no request is on its way (nothing is queued). */
    val canTapShareLink: Boolean get() = showsShareLink && !isOffline && !isSharing

    /** The class's name in the viewer's language: the English name for an English viewer and a class that has one. */
    fun title(english: Boolean): String {
        val named = session?.groupClass ?: return ""
        return pick(english, named.nameNl, named.nameEn)?.text ?: named.nameNl
    }

    /** The series line of a date in a weekly series, from the series the API sends; `null` for a date on its own. */
    fun seriesLine(english: Boolean): SeriesLine? {
        val series = session?.series ?: return null
        return SeriesLine(title(english), series.localStartTime, series.weekday.dayOfWeek())
    }

    /** The description in the viewer's language, else Dutch (marked as Dutch); `null` when the class has none to show. */
    fun description(english: Boolean): ClassText? =
        groupClass?.let { pick(english, it.descriptionNl, it.descriptionEn) }

    companion object {
        /** How many participants TD-03 lists before *Toon alle {n}* (the prototype's *Les (TD-03)*). */
        const val SHOWN_PARTICIPANTS = 5

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
    canShareLink: Boolean = false,
    /** Whether the phone is online, from the network (`Connectivity`); a model made without one says online. */
    private val isOnline: () -> Boolean = { true },
    /** The time now, to tell a date to come from one that has started. */
    private val now: () -> Instant,
    /** Puts a text on the phone's clipboard. */
    private val copy: (String) -> Unit = {},
    /** Told once the date is cancelled, so the lists that show it (Vandaag, Agenda) read again. */
    private val onCancelled: () -> Unit = {},
    private val onNotAllowed: (Response<*>) -> Unit = {},
    /** Told a 403 of the cancel calls: they are guarded by `class.manage`, where [onNotAllowed] is about reading. */
    private val onCancelNotAllowed: (Response<*>) -> Unit = {},
    /** Told a 403 of *Boekingslink delen*: it is guarded by `booking_link.copy`. */
    private val onShareNotAllowed: (Response<*>) -> Unit = {},
) : ViewModel() {
    private val _state = MutableStateFlow(
        ClassDateState(teamMemberId, canManage, added, canShareLink = canShareLink, now = now()),
    )
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

    /** *Toon alle {n}* of the *Deelnemers* list. */
    fun showAllParticipants() = _state.update { it.copy(participantsOpen = true) }

    fun toggleDescription() = _state.update { it.copy(descriptionOpen = !it.descriptionOpen) }

    /** *Les wijzigen*: the class is managed on the web, and the screen says so. */
    fun editTapped() = _state.update { it.copy(manageOnWeb = true) }

    /** *De trainer vervangen* (F024): substituting is managed on the web, and the screen says so. */
    fun substituteTapped() = _state.update { it.copy(manageOnWeb = true) }

    /**
     * *Les annuleren* of the ⋯ menu: asks the API who would get the email, then the confirmation shows. When the API can't be
     * reached nothing is asked and the screen says it is offline.
     */
    fun askToCancel() {
        val shown = _state.value
        if (!shown.copy(online = isOnline()).canStartCancel) return
        _state.update { it.copy(cancelFailure = null) }
        viewModelScope.launch { preview() }
    }

    /**
     * *Boekingslink delen* (F037 AC8, AC9): gets or makes the link of this date in the visitor's language, puts its short
     * URL on the clipboard and counts it in [ClassDateState.copied]; a second tap gives the same link. Nothing happens
     * offline (nothing is queued), on a cancelled or past date or for a private session.
     */
    fun shareLink() {
        val shown = _state.value.copy(online = isOnline(), now = now())
        if (!shown.canTapShareLink) return
        _state.update { it.copy(isSharing = true, shareFailure = null, now = shown.now) }
        viewModelScope.launch { share() }
    }

    /** *Terug*: nothing is cancelled. */
    fun dismissCancel() = _state.update { it.copy(cancelAsk = null) }

    /** *Les annuleren* of the confirmation: cancels this date only, with the `version` the person saw. */
    fun confirmCancel() {
        val session = _state.value.session ?: return
        if (_state.value.isCancelling || session.status != Session.Status.SCHEDULED) return
        _state.update { it.copy(cancelAsk = null, cancelFailure = null, isCancelling = true) }
        viewModelScope.launch { cancel(session) }
    }

    private suspend fun share() {
        val request = CreateBookingLinkRequest(
            scope = CreateBookingLinkRequest.Scope.SESSION,
            language = CreateBookingLinkRequest.Language.VISITOR,
            sessionId = sessionId,
            surface = CreateBookingLinkRequest.Surface.ANDROID,
        )
        val response = try {
            apis.bookingLinks.createBookingLink(workspaceId, request)
        } catch (_: IOException) {
            return _state.update { it.copy(isSharing = false, requestFailedOffline = true) }
        } catch (_: SerializationException) {
            return _state.update { it.copy(isSharing = false, shareFailure = ShareFailure.NotShared) }
        }
        // The link exists (`201`) or was there (`200`): either way it is the date's.
        val link = response.body()?.takeIf { response.isSuccessful }
        when {
            link != null -> {
                copy(link.url.toString())
                _state.update { it.copy(isSharing = false, requestFailedOffline = false, copied = it.copied + 1) }
            }

            response.code() == HTTP_FORBIDDEN -> {
                onShareNotAllowed(response)
                _state.update { it.copy(isSharing = false, shareFailure = ShareFailure.NoPermission) }
            }

            else -> _state.update { it.copy(isSharing = false, shareFailure = ShareFailure.NotShared) }
        }
    }

    private suspend fun preview() {
        val response = try {
            apis.classes.previewClassCancellation(workspaceId, sessionId)
        } catch (_: IOException) {
            return _state.update { it.copy(requestFailedOffline = true) }
        } catch (_: SerializationException) {
            return _state.update { it.copy(cancelFailure = CancelFailure.NotSaved) }
        }
        val found = response.body()?.takeIf { response.isSuccessful }
        when {
            found != null -> _state.update {
                it.copy(
                    requestFailedOffline = false,
                    cancelAsk = CancelAsk(found.thisDate.participants, found.started),
                )
            }

            response.code() == HTTP_FORBIDDEN -> {
                onCancelNotAllowed(response)
                _state.update { it.copy(cancelFailure = CancelFailure.NoPermission) }
            }

            // Cancelled already: the screen reads it as it is now.
            response.code() == HTTP_CONFLICT -> {
                _state.update { it.copy(cancelFailure = CancelFailure.Cancelled) }
                read()
            }

            else -> _state.update { it.copy(cancelFailure = CancelFailure.NotSaved) }
        }
    }

    private suspend fun cancel(session: Session) {
        val request = CancelClassDateRequest(
            scope = CancelClassDateRequest.Scope.THIS,
            version = session.version,
            surface = CancelClassDateRequest.Surface.ANDROID,
        )
        val response = try {
            apis.classes.cancelClassDate(workspaceId, sessionId, request)
        } catch (_: IOException) {
            return _state.update { it.copy(isCancelling = false, requestFailedOffline = true) }
        } catch (_: SerializationException) {
            return _state.update { it.copy(isCancelling = false, cancelFailure = CancelFailure.NotSaved) }
        }
        val cancelled = response.body()?.takeIf { response.isSuccessful }
        when {
            cancelled != null -> {
                _state.update {
                    it.copy(isCancelling = false, session = cancelled.session, requestFailedOffline = false)
                }
                onCancelled()
            }

            response.code() == HTTP_CONFLICT -> refused(response)

            response.code() == HTTP_FORBIDDEN -> {
                onCancelNotAllowed(response)
                _state.update { it.copy(isCancelling = false, cancelFailure = CancelFailure.NoPermission) }
            }

            else -> _state.update { it.copy(isCancelling = false, cancelFailure = CancelFailure.NotSaved) }
        }
    }

    // The date was changed or cancelled first: the screen shows it as it is now.
    private fun refused(response: Response<*>) {
        val refusal = runCatching {
            Serializer.kotlinxSerializationJson.decodeFromString<CancelClassDateRefusal>(
                response.errorBody()?.string().orEmpty(),
            )
        }.getOrNull()
        if (refusal == null) {
            _state.update { it.copy(isCancelling = false, cancelFailure = CancelFailure.NotSaved) }
            return
        }
        val alreadyCancelled = refusal.code == CancelClassDateRefusal.Code.SESSION_CANCELLED
        _state.update {
            it.copy(
                isCancelling = false,
                session = refusal.session,
                cancelFailure = if (alreadyCancelled) {
                    CancelFailure.Cancelled
                } else {
                    CancelFailure.Changed(refusal.changedBy?.name)
                },
            )
        }
        if (alreadyCancelled) onCancelled()
    }

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
                it.copy(load = ClassDateLoad.Loaded, session = fresh, requestFailedOffline = false, now = now())
            }

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

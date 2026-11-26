package app.fivvi.pro.attendance

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fivvi.api.models.Attendance
import app.fivvi.pro.personal.PersonalRows
import java.io.IOException
import java.net.HttpURLConnection.HTTP_FORBIDDEN
import java.net.HttpURLConnection.HTTP_NOT_FOUND
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneId
import java.util.UUID
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.SerializationException

enum class AttendanceLoad {
    Loading,
    Loaded,
    Failed,

    /** The API refused the session (the team access is gone, or it is not in the workspace). */
    NoPermission,
}

/** The class and the time CO-05 names under its title; the answer for the attendance has neither. */
data class AttendanceHeader(
    val nameNl: String?,
    val nameEn: String?,
    val startsAt: OffsetDateTime,
    val endsAt: OffsetDateTime,
    val zone: ZoneId,
)

/** What the API last said of one session's attendance. */
data class AttendanceState(
    val load: AttendanceLoad = AttendanceLoad.Loading,
    val attendance: Attendance? = null,
    /** Only for CO-05 (read with `withHeader`): `null` until read, and when it can't be. */
    val header: AttendanceHeader? = null,
)

/** *5 aanwezig · 1 niet verschenen · 1 open*, counted from the rows as the phone has them. */
data class Summary(val attended: Int, val noShow: Int, val open: Int, val cancelled: Int)

/** A participant as the screen shows it: the status with the waiting requests applied. */
data class AttendanceRow(
    val clientId: UUID,
    val name: String,
    val status: AttendanceStatus,
    /** A request of this row is still in the queue. */
    val isPending: Boolean,
    /** The API refused the last request of this row: the row is back at its status, and this says why. */
    val refusal: Reason?,
)

/**
 * The attendance of one session as TD-02 and CO-05 show it: the last answer of the API, the requests waiting in the queue
 * laid over it, and [at], the time the buttons are judged at. The API decides who may take attendance and from when
 * (`canTakeAttendance`, `attendanceOpensAt`); this only reads those, and words nothing: the screens do, in the language of the
 * moment, so a switch of language reaches them at once (#1619).
 */
class AttendanceView(private val attendance: Attendance?, private val queue: QueueState, private val at: Instant) {
    private val sessionId: UUID? = attendance?.sessionId

    val isClass: Boolean get() = attendance?.type == Attendance.Type.GROUP
    val isCancelled: Boolean get() = attendance?.status == Attendance.Status.CANCELLED

    /** When attendance opens: 30 minutes before the start, as the API says. */
    val opensAt: Instant? get() = attendance?.attendanceOpensAt?.toInstant()

    /** The window has not opened yet: the buttons are off. */
    val isTooEarly: Boolean get() = opensAt?.let { at.isBefore(it) } ?: false

    /** A tap is accepted: the caller may take attendance, the session takes place and the window is open. */
    val canMark: Boolean get() = attendance?.canTakeAttendance == true && !isCancelled && !isTooEarly

    /** The participants with the waiting requests applied, in the API's order. */
    val rows: List<AttendanceRow> by lazy {
        val current = attendance ?: return@lazy emptyList()
        val status = current.participants.associate { it.clientId to AttendanceStatus.of(it.status) }.toMutableMap()
        val pending = mutableSetOf<UUID>()
        for (entry in queue.pending(current.sessionId)) {
            when (val action = entry.action) {
                is QueueAction.Set -> {
                    val was = status[action.clientId] ?: continue
                    if (was == AttendanceStatus.CANCELLED) continue
                    status[action.clientId] = action.status
                    pending += action.clientId
                }

                is QueueAction.Everyone -> status.filterValues { it == AttendanceStatus.BOOKED }.keys.forEach {
                    status[it] = AttendanceStatus.ATTENDED
                    pending += it
                }
            }
        }
        val refused = queue.rejections(current.sessionId)
        current.participants.map { participant ->
            AttendanceRow(
                participant.clientId,
                participant.name,
                status.getValue(participant.clientId),
                participant.clientId in pending,
                refused.lastOrNull { participant.clientId in it.clientIds }?.reason,
            )
        }
    }

    /** How many requests of this session the API refused: a screen reads again when it grows. */
    val refusals: Int get() = sessionId?.let { queue.rejections(it).size } ?: 0

    /** The counts of the rows as the phone has them, requests still waiting included. */
    val summary: Summary
        get() = rows.let { rows ->
            fun count(status: AttendanceStatus) = rows.count { it.status == status }
            Summary(
                count(AttendanceStatus.ATTENDED),
                count(AttendanceStatus.NO_SHOW),
                count(AttendanceStatus.BOOKED),
                count(AttendanceStatus.CANCELLED),
            )
        }

    /** *Wacht op verbinding* shows on the rows that wait: the phone is offline or sending does not get through. */
    val rowsWaitForConnection: Boolean get() = queue.waitsForConnection

    /** *Iedereen aanwezig* is possible: a class date with a participant still open, in an open window. */
    val canMarkEveryone: Boolean get() = isClass && canMark && rows.any { it.status == AttendanceStatus.BOOKED }
}

/**
 * The attendance of one session (F025), for TD-02 (a private session's client or clients) and CO-05 (a class date's
 * participants): read from `GET …/participants` through the generated client, with the requests of [queue] laid over it by
 * [view]. A tap is a request of the queue, so it is saved at once and sent when the phone is online. [onForbidden] is told a
 * `403`, for the capability helper.
 */
class AttendanceViewModel(
    private val api: app.fivvi.api.apis.SessionsApi,
    private val workspaceId: UUID,
    private val sessionId: UUID,
    private val queue: AttendanceQueue,
    private val now: () -> Instant = Instant::now,
    private val onForbidden: () -> Unit = {},
    /** Also reads the session, for the name and the time CO-05 shows under its title. */
    private val withHeader: Boolean = false,
) : ViewModel() {
    private val _state = MutableStateFlow(AttendanceState())
    val state: StateFlow<AttendanceState> = _state.asStateFlow()
    private var reading: Job? = null

    init {
        load()
    }

    fun retry() {
        _state.update { it.copy(load = AttendanceLoad.Loading) }
        load()
    }

    /** The screen is shown again: reads again and leaves what is on screen until the answer is there. */
    fun refresh() = load()

    private fun load() {
        reading?.cancel()
        reading = viewModelScope.launch { read() }
    }

    private suspend fun read() {
        val response = try {
            api.listSessionParticipants(workspaceId, sessionId)
        } catch (_: IOException) {
            return failed()
        } catch (_: SerializationException) {
            return failed()
        }
        val found = response.body()?.takeIf { response.isSuccessful }
        when {
            found != null -> {
                queue.forgetAnswer(sessionId)
                _state.update { it.copy(load = AttendanceLoad.Loaded, attendance = found) }
                if (withHeader && _state.value.header == null) readHeader()
            }

            response.code() == HTTP_FORBIDDEN || response.code() == HTTP_NOT_FOUND -> {
                if (response.code() == HTTP_FORBIDDEN) onForbidden()
                _state.update { it.copy(load = AttendanceLoad.NoPermission) }
            }

            else -> failed()
        }
    }

    // Only to word the screen: a failure here changes nothing.
    private suspend fun readHeader() {
        val response = try {
            api.getSession(workspaceId, sessionId)
        } catch (_: IOException) {
            return
        } catch (_: SerializationException) {
            return
        }
        val session = response.body()?.takeIf { response.isSuccessful } ?: return
        val zone = runCatching { ZoneId.of(session.timeZone) }.getOrDefault(PersonalRows.TIME_ZONE)
        val header = AttendanceHeader(
            session.groupClass?.nameNl,
            session.groupClass?.nameEn,
            session.startsAt,
            session.endsAt,
            zone,
        )
        _state.update { it.copy(header = header) }
    }

    private fun failed() = _state.update {
        if (it.load == AttendanceLoad.Loaded) it else it.copy(load = AttendanceLoad.Failed)
    }

    /** What the screens show, for the queue as [queueState] says it is. */
    fun view(queueState: QueueState = queue.state.value, at: Instant = now()): AttendanceView =
        AttendanceView(queueState.answers[sessionId] ?: _state.value.attendance, queueState, at)

    /** Sets a status: queued, so it is saved at once and sent when the phone is online. */
    fun set(status: AttendanceStatus, clientId: UUID) {
        val view = view()
        val row = view.rows.firstOrNull { it.clientId == clientId } ?: return
        if (!view.canMark || row.status == AttendanceStatus.CANCELLED || row.status == status) return
        if (status.request == null) return
        queue.enqueue(workspaceId, sessionId, QueueAction.Set(clientId, status))
    }

    /** The two buttons of a row: tapping the selected one again takes the tap back to *Geboekt*. */
    fun toggle(status: AttendanceStatus, clientId: UUID) {
        val row = view().rows.firstOrNull { it.clientId == clientId } ?: return
        set(if (row.status == status) AttendanceStatus.BOOKED else status, clientId)
    }

    /** *Iedereen aanwezig*: one queued request; the rows still open show *Aanwezig* at once. */
    fun markEveryone() {
        val view = view()
        if (!view.canMarkEveryone) return
        val open = view.rows.filter { it.status == AttendanceStatus.BOOKED }.map { it.clientId }
        queue.enqueue(workspaceId, sessionId, QueueAction.Everyone(open))
    }
}

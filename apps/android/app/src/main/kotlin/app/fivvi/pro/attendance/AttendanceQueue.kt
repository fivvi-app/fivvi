package app.fivvi.pro.attendance

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fivvi.api.apis.SessionsApi
import app.fivvi.api.infrastructure.Serializer
import app.fivvi.api.models.Attendance
import app.fivvi.api.models.AttendanceParticipant
import app.fivvi.api.models.AttendanceRefusal
import app.fivvi.api.models.AttendanceTooEarly
import app.fivvi.api.models.MarkEveryoneAttendedRequest
import app.fivvi.api.models.SessionParticipant
import app.fivvi.api.models.SetAttendanceRequest
import app.fivvi.core.net.Connectivity
import app.fivvi.pro.personal.PersonalStore
import java.io.IOException
import java.net.HttpURLConnection.HTTP_BAD_REQUEST
import java.net.HttpURLConnection.HTTP_CONFLICT
import java.net.HttpURLConnection.HTTP_INTERNAL_ERROR
import java.net.HttpURLConnection.HTTP_OK
import java.net.HttpURLConnection.HTTP_UNAUTHORIZED
import java.time.Instant
import java.util.UUID
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** A participant's status as the screens show it; the API names it in three payloads, this joins them. */
enum class AttendanceStatus {
    BOOKED,
    ATTENDED,
    NO_SHOW,
    CANCELLED,
    ;

    /** What `PUT …/attendance` takes: never `cancelled`, which only cancelling a place sets. */
    val request: SetAttendanceRequest.Status?
        get() = when (this) {
            BOOKED -> SetAttendanceRequest.Status.BOOKED
            ATTENDED -> SetAttendanceRequest.Status.ATTENDED
            NO_SHOW -> SetAttendanceRequest.Status.NO_SHOW
            CANCELLED -> null
        }

    companion object {
        fun of(status: AttendanceParticipant.Status) = when (status) {
            AttendanceParticipant.Status.BOOKED -> BOOKED
            AttendanceParticipant.Status.ATTENDED -> ATTENDED
            AttendanceParticipant.Status.NO_SHOW -> NO_SHOW
            AttendanceParticipant.Status.CANCELLED -> CANCELLED
        }

        /** The same status as a session's own list of participants has it. */
        fun of(status: SessionParticipant.AttendanceStatus) = when (status) {
            SessionParticipant.AttendanceStatus.BOOKED -> BOOKED
            SessionParticipant.AttendanceStatus.ATTENDED -> ATTENDED
            SessionParticipant.AttendanceStatus.NO_SHOW -> NO_SHOW
            SessionParticipant.AttendanceStatus.CANCELLED -> CANCELLED
        }
    }
}

/** What a request of the queue does: a tap, or *Iedereen aanwezig* with the participants that were still open. */
sealed interface QueueAction {
    val clientIds: List<UUID>

    data class Set(val clientId: UUID, val status: AttendanceStatus) : QueueAction {
        override val clientIds: List<UUID> get() = listOf(clientId)
    }

    /** The participants still open when it was tapped: the rows it changes. */
    data class Everyone(override val clientIds: List<UUID>) : QueueAction
}

/** A request waiting in the queue; [id] is its client request ID, sent again with every retry. */
data class QueueEntry(
    val id: UUID,
    val accountId: String,
    val workspaceId: UUID,
    val sessionId: UUID,
    val action: QueueAction,
)

/** Why a request left the queue without being stored. */
sealed interface Reason {
    data object SessionCancelled : Reason

    data object ParticipantCancelled : Reason

    data class TooEarly(val opensAt: Instant) : Reason

    /** Anything else the API refused, and an answer the app cannot read. */
    data object Other : Reason
}

data class Rejection(val id: UUID, val sessionId: UUID, val clientIds: List<UUID>, val reason: Reason)

/** What the screens read of the queue. */
data class QueueState(
    val entries: List<QueueEntry> = emptyList(),
    /** The last answer of the API to a request of each session since its screen read it. */
    val answers: Map<UUID, Attendance> = emptyMap(),
    /**
     * How many participants of each session the API's last answer left open, until Vandaag or *Hele studio* read their day
     * again: what keeps a nudge away meanwhile.
     */
    val settled: Map<UUID, Int> = emptyMap(),
    val rejections: List<Rejection> = emptyList(),
    /** The last attempt to send did not get through. */
    val stalled: Boolean = false,
    val online: Boolean = true,
    /** Counts every request that left the queue, sent or refused, so a screen can read again. */
    val revision: Int = 0,
) {
    fun pending(sessionId: UUID) = entries.filter { it.sessionId == sessionId }

    fun hasPending(sessionId: UUID) = entries.any { it.sessionId == sessionId }

    fun rejections(sessionId: UUID) = rejections.filter { it.sessionId == sessionId }

    /** *Wacht op verbinding*: something is waiting and the phone is offline or the last attempt did not get through. */
    val waitsForConnection: Boolean get() = entries.isNotEmpty() && (stalled || !online)
}

/**
 * F025's offline queue: every attendance tap of the app is a request in a list, sent in order with a client request ID of its
 * own (a request sent twice stores one change). The list is kept in [store], a file of the app's private storage that survives
 * restarts, and is sent while the phone is online. A request the API refuses leaves the list with the [Reason], so the screens
 * revert that row and word it: a refusal the contract doesn't list (another 4xx) and an answer that can't be read count as one
 * with [Reason.Other], so the queue never stalls on them; a 5xx and a lost connection are sent again. *Iedereen aanwezig* is one
 * request of its own, in order with the taps around it (owner, 9 November 2026).
 *
 * Every entry names the account that tapped, and the list is read for one account ([adopt]): what an earlier account left is
 * never sent and is deleted. The file is read when the queue is made, so what waited on the phone shows, counts for the
 * sign-out warning and is never overwritten while `GET /v1/me` has not answered yet (an app opened offline, a tap before the
 * answer); nothing is sent until [adopt] names the account. The sign-out clears the queue ([clear], in memory and on disk)
 * after the screens warned; a token the API rejects (a 401) does not: the taps stay on disk and are sent when the same
 * account signs in again.
 *
 * The file is written and deleted on [io], in the order the changes were made (one writer), and what was handed to it still
 * is written when the screen that made the queue is gone.
 */
class AttendanceQueue(
    private val api: SessionsApi,
    private val store: PersonalStore,
    connectivity: Connectivity,
    /** The sign-in this queue belongs to is still the current one: after the sign-out nothing is sent or written. */
    private val stillSignedIn: () -> Boolean = { true },
    private val makeId: () -> UUID = UUID::randomUUID,
    /** How long after a failed attempt the queue tries again by itself; `null` leaves it to the next tap and the network. */
    private val retryAfter: Duration? = 5.seconds,
    io: CoroutineDispatcher = Dispatchers.IO,
) : ViewModel() {
    // What the last sign-in left on the phone, read once: it is part of the list from the start, so no write drops it.
    private val fromDisk = readFile()
    private val _state = MutableStateFlow(QueueState(entries = fromDisk, online = connectivity.online.value))
    val state: StateFlow<QueueState> = _state.asStateFlow()
    private val lock = Any()
    private var accountId: String? = null
    private var closed = false
    private var running: Job? = null
    private var retry: Job? = null

    // The writer: one coroutine takes the changes of the file one after the other. It outlives the view model's own scope, so
    // the last tap before the screen is closed still reaches the disk; closing the channel ends it once it has written them.
    private val disk = Channel<DiskChange>(Channel.UNLIMITED)
    private val writer = CoroutineScope(SupervisorJob() + io)

    init {
        writer.launch {
            for (change in disk) {
                when (change) {
                    is DiskChange.Write -> store.write(FILE, change.bytes)
                    DiskChange.Clear -> store.clear()
                }
            }
        }
        viewModelScope.launch {
            connectivity.online.collect { online ->
                _state.update { it.copy(online = online) }
                if (online) flush()
            }
        }
    }

    override fun onCleared() {
        disk.close()
    }

    private sealed interface DiskChange {
        class Write(val bytes: ByteArray) : DiskChange

        data object Clear : DiskChange
    }

    // MARK: Account

    /**
     * Takes the list of this phone for [account] (`GET /v1/me` answered, the first time only): the requests of that account are
     * sent from now on, those of any other account are deleted, and what was tapped before the account was known is this
     * sign-in's. A tap of an earlier run that was made before its account was known is this account's too, unless the file
     * also holds the taps of another one: then nobody can say whose it was, and it goes with them.
     */
    fun adopt(account: String) {
        synchronized(lock) {
            // A queue belongs to one sign-in, so one account: every later answer of `GET /v1/me` is the same person.
            if (closed || accountId != null) return
            accountId = account
            val foreign = fromDisk.any { it.accountId != UNKNOWN && it.accountId != account }
            val earlier = fromDisk.mapTo(mutableSetOf()) { it.id }
            // The list is in the order it was tapped (the file's entries first): keep it, and make what has no account yet this one's.
            val kept = _state.value.entries.filter {
                it.accountId == account ||
                    (it.accountId == UNKNOWN && !(foreign && it.id in earlier))
            }.map { if (it.accountId == UNKNOWN) it.copy(accountId = account) else it }
            _state.update { it.copy(entries = kept.distinctBy(QueueEntry::id)) }
            save()
        }
        flush()
    }

    // MARK: Queueing

    fun enqueue(workspaceId: UUID, sessionId: UUID, action: QueueAction) {
        synchronized(lock) {
            if (closed) return
            val entry = QueueEntry(makeId(), accountId ?: UNKNOWN, workspaceId, sessionId, action)
            _state.update { state ->
                state.copy(
                    entries = state.entries + entry,
                    rejections = state.rejections.filterNot {
                        it.sessionId == sessionId && it.clientIds.any(action.clientIds::contains)
                    },
                )
            }
            save()
        }
        flush()
    }

    fun dismissRejections(sessionId: UUID, clientIds: List<UUID>) = _state.update { state ->
        state.copy(
            rejections = state.rejections.filterNot {
                it.sessionId == sessionId &&
                    it.clientIds.any(clientIds::contains)
            },
        )
    }

    fun forgetAnswer(sessionId: UUID) = _state.update { it.copy(answers = it.answers - sessionId) }

    /** A day was read again: it has the answers now. */
    fun forgetSettled() = _state.update { it.copy(settled = emptyMap()) }

    /** The sign-out: what waits is lost (the screens warned first), in memory and on disk, and nothing is written again. */
    fun clear() {
        synchronized(lock) {
            closed = true
            retry?.cancel()
            _state.value = QueueState(online = _state.value.online)
            disk.trySend(DiskChange.Clear)
        }
    }

    // MARK: Sending

    /** Sends the requests in order until one cannot be sent. One run at a time; a run also sends what was queued meanwhile. */
    fun flush() {
        if (running?.isActive == true) return
        running = viewModelScope.launch { run() }
    }

    private suspend fun run() {
        retry?.cancel()
        while (true) {
            val entry = _state.value.entries.firstOrNull() ?: return
            if (closed || !stillSignedIn() || accountId != entry.accountId || !_state.value.online) return
            when (val outcome = send(entry)) {
                is Outcome.Sent -> leave(entry) { state ->
                    state.copy(
                        answers = state.answers + (entry.sessionId to outcome.answer),
                        settled = state.settled + (entry.sessionId to outcome.answer.summary.open),
                        stalled = false,
                    )
                }

                is Outcome.Rejected -> leave(entry) { state ->
                    state.copy(
                        rejections = state.rejections +
                            Rejection(entry.id, entry.sessionId, entry.action.clientIds, outcome.reason),
                        stalled = false,
                    )
                }

                Outcome.Retry -> {
                    _state.update { it.copy(stalled = true) }
                    scheduleRetry()
                    return
                }
            }
        }
    }

    // The request left the queue: unless the sign-out cleared it meanwhile, which a send that was running must not undo.
    private fun leave(entry: QueueEntry, change: (QueueState) -> QueueState) {
        synchronized(lock) {
            if (closed) return
            _state.update { state ->
                change(state).let {
                    it.copy(
                        entries = it.entries.filterNot { e -> e.id == entry.id },
                        revision =
                            state.revision + 1,
                    )
                }
            }
            save()
        }
    }

    private fun scheduleRetry() {
        val after = retryAfter ?: return
        retry = viewModelScope.launch {
            delay(after)
            flush()
        }
    }

    private sealed interface Outcome {
        data class Sent(val answer: Attendance) : Outcome

        data class Rejected(val reason: Reason) : Outcome

        /** The API could not be reached, or failed: the request stays and is sent again. */
        data object Retry : Outcome
    }

    private suspend fun send(entry: QueueEntry): Outcome {
        val response = try {
            when (val action = entry.action) {
                is QueueAction.Set -> api.setParticipantAttendance(
                    entry.workspaceId,
                    entry.sessionId,
                    action.clientId,
                    SetAttendanceRequest(
                        requireNotNull(action.status.request),
                        entry.id,
                        SetAttendanceRequest.Surface.ANDROID,
                    ),
                )

                is QueueAction.Everyone -> api.markEveryoneAttended(
                    entry.workspaceId,
                    entry.sessionId,
                    MarkEveryoneAttendedRequest(entry.id, MarkEveryoneAttendedRequest.Surface.ANDROID),
                )
            }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: IOException) {
            return Outcome.Retry
        } catch (_: SerializationException) {
            // The API answered, with a body the client could not read: resending would not help, and the requests behind it
            // would never go.
            return Outcome.Rejected(Reason.Other)
        }
        val code = response.code()
        return when {
            code == HTTP_OK -> response.body()?.let(Outcome::Sent) ?: Outcome.Rejected(Reason.Other)

            code == HTTP_CONFLICT -> Outcome.Rejected(refusal(response.errorBody()?.string()))

            code == HTTP_UNPROCESSABLE -> Outcome.Rejected(tooEarly(response.errorBody()?.string()))

            // The token ended: the sign-in screen is next, and the taps wait for the same account.
            code == HTTP_UNAUTHORIZED || code >= HTTP_INTERNAL_ERROR -> Outcome.Retry

            // 400, 403, 404 and any other answer the contract does not list.
            code >= HTTP_BAD_REQUEST -> Outcome.Rejected(Reason.Other)

            else -> Outcome.Retry
        }
    }

    private fun refusal(body: String?): Reason = try {
        when (json.decodeFromString(AttendanceRefusal.serializer(), body.orEmpty()).code) {
            AttendanceRefusal.Code.PARTICIPANT_CANCELLED -> Reason.ParticipantCancelled
            AttendanceRefusal.Code.SESSION_CANCELLED -> Reason.SessionCancelled
        }
    } catch (_: SerializationException) {
        Reason.Other
    } catch (_: IllegalArgumentException) {
        Reason.Other
    }

    private fun tooEarly(body: String?): Reason = try {
        Reason.TooEarly(json.decodeFromString(AttendanceTooEarly.serializer(), body.orEmpty()).opensAt.toInstant())
    } catch (_: SerializationException) {
        Reason.Other
    } catch (_: IllegalArgumentException) {
        Reason.Other
    }

    // MARK: The file

    // Written under [lock], which [clear] takes too: a write that comes after the clear finds the queue closed.
    private fun save() {
        if (closed || !stillSignedIn()) return
        val list = JsonArray(_state.value.entries.map(::encode))
        disk.trySend(DiskChange.Write(list.toString().encodeToByteArray()))
    }

    private fun readFile(): List<QueueEntry> {
        val bytes = store.read(FILE) ?: return emptyList()
        return try {
            Serializer.kotlinxSerializationJson.parseToJsonElement(bytes.decodeToString()).jsonArray.map(::decode)
        } catch (_: SerializationException) {
            emptyList()
        } catch (_: IllegalArgumentException) {
            emptyList()
        } catch (_: NoSuchElementException) {
            emptyList()
        }
    }

    private fun encode(entry: QueueEntry): JsonObject {
        val fields = mutableMapOf<String, kotlinx.serialization.json.JsonElement>(
            ID to JsonPrimitive(entry.id.toString()),
            ACCOUNT to JsonPrimitive(entry.accountId),
            WORKSPACE to JsonPrimitive(entry.workspaceId.toString()),
            SESSION to JsonPrimitive(entry.sessionId.toString()),
        )
        when (val action = entry.action) {
            is QueueAction.Set -> {
                fields[KIND] = JsonPrimitive(SET)
                fields[CLIENT] = JsonPrimitive(action.clientId.toString())
                fields[STATUS] = JsonPrimitive(action.status.name)
            }

            is QueueAction.Everyone -> {
                fields[KIND] = JsonPrimitive(EVERYONE)
                fields[CLIENTS] = JsonArray(action.clientIds.map { JsonPrimitive(it.toString()) })
            }
        }
        return JsonObject(fields)
    }

    private fun decode(element: kotlinx.serialization.json.JsonElement): QueueEntry {
        val item = element.jsonObject
        fun text(name: String) = item.getValue(name).jsonPrimitive.content
        val action = when (text(KIND)) {
            SET -> QueueAction.Set(UUID.fromString(text(CLIENT)), AttendanceStatus.valueOf(text(STATUS)))

            else -> QueueAction.Everyone(
                item.getValue(CLIENTS).jsonArray.map {
                    UUID.fromString(it.jsonPrimitive.content)
                },
            )
        }
        return QueueEntry(
            UUID.fromString(text(ID)),
            text(ACCOUNT),
            UUID.fromString(text(WORKSPACE)),
            UUID.fromString(text(SESSION)),
            action,
        )
    }

    private companion object {
        const val FILE = "attendance-queue.json"
        const val UNKNOWN = ""
        const val HTTP_UNPROCESSABLE = 422
        val json = Serializer.kotlinxSerializationJson
        const val ID = "id"
        const val ACCOUNT = "account"
        const val WORKSPACE = "workspace"
        const val SESSION = "session"
        const val KIND = "kind"
        const val SET = "set"
        const val EVERYONE = "everyone"
        const val CLIENT = "client"
        const val CLIENTS = "clients"
        const val STATUS = "status"
    }
}

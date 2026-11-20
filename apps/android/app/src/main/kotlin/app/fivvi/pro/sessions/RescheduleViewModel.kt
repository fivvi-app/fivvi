package app.fivvi.pro.sessions

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fivvi.api.apis.SessionsApi
import app.fivvi.api.infrastructure.Serializer
import app.fivvi.api.models.Locale
import app.fivvi.api.models.ReschedulePrivateSessionRefusal
import app.fivvi.api.models.ReschedulePrivateSessionRequest
import app.fivvi.api.models.Session
import java.io.IOException
import java.net.HttpURLConnection.HTTP_CONFLICT
import java.net.HttpURLConnection.HTTP_FORBIDDEN
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.util.UUID
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.SerializationException
import kotlinx.serialization.decodeFromString
import retrofit2.Response

/** What a move that didn't happen says. */
sealed interface RescheduleFailure {
    /** Someone else changed the session first (`409`): [byName] is who, when the API knows. */
    data class Changed(val byName: String?) : RescheduleFailure

    data object Cancelled : RescheduleFailure

    data object NoPermission : RescheduleFailure

    data object NotSaved : RescheduleFailure
}

/** What PS-05 shows and holds. */
data class RescheduleState(
    val session: Session,
    val time: SessionTime,
    /** The client gets the change by email: on for a session still to come. */
    val notify: Boolean,
    val failure: RescheduleFailure? = null,
    val saving: Boolean = false,
    /** The API moved the session: PS-05 closes and TD-02 says where it went. */
    val moved: Session? = null,
) {
    val zone: ZoneId get() = ZoneId.of(session.timeZone)

    /** Where the session ends, for *Eindigt om…*. */
    val endsAt: SessionClock.End get() = SessionClock.end(time.start, time.durationMinutes, zone)
}

/**
 * PS-05 *Sessie verplaatsen* (F020 AC6, AC8): a new date, start and length for a private session, and whether the client
 * gets the change by email (on for a session still to come). The API moves it (`POST …/reschedule`) with the `version` the
 * person saw and decides every rule; when someone else changed the session first (`409`) the form says who and shows the
 * session as it is now. [emailLocale] is the language the client's emails go out in, for the note under the switch.
 */
class RescheduleViewModel(
    private val api: SessionsApi,
    private val workspaceId: UUID,
    session: Session,
    val emailLocale: Locale,
    private val onNotAllowed: (Response<*>) -> Unit = {},
    now: () -> Instant = Instant::now,
) : ViewModel() {
    private val _state = MutableStateFlow(
        ZoneId.of(session.timeZone).let { zone ->
            RescheduleState(
                session,
                SessionTime(
                    SessionClock.local(session.startsAt, zone),
                    SessionClock.minutes(session.startsAt, session.endsAt),
                ),
                notify = session.startsAt.toInstant().isAfter(now()),
            )
        },
    )
    val state: StateFlow<RescheduleState> = _state.asStateFlow()

    fun setNotify(notify: Boolean) = _state.update { it.copy(notify = notify) }

    fun setDate(date: LocalDate) = _state.update { it.copy(time = it.time.withDate(date)) }

    fun setStart(time: LocalTime) = _state.update { it.copy(time = it.time.withTime(time)) }

    fun chooseDuration(choice: Int) = _state.update { it.copy(time = it.time.chooseDuration(choice)) }

    fun setOtherDuration(minutes: Int) = _state.update { it.copy(time = it.time.withOtherDuration(minutes)) }

    /** The move was handed on: it isn't handed on again. */
    fun onMovedHandled() = _state.update { it.copy(moved = null) }

    /** Moves the session. When the API moved it, [RescheduleState.moved] has it; otherwise the state says what went wrong. */
    fun save() {
        val shown = _state.value
        if (shown.saving || shown.session.status != Session.Status.SCHEDULED) return
        _state.update { it.copy(failure = null, time = it.time.cleared(), saving = true) }
        val request = ReschedulePrivateSessionRequest(
            localDate = SessionClock.localDate(shown.time.start),
            localStart = SessionClock.localStart(shown.time.start),
            durationMinutes = shown.time.durationMinutes,
            notify = shown.notify,
            version = shown.session.version,
            surface = ReschedulePrivateSessionRequest.Surface.ANDROID,
        )
        viewModelScope.launch { send(shown.session.id, request) }
    }

    private suspend fun send(sessionId: UUID, request: ReschedulePrivateSessionRequest) {
        val response = try {
            api.reschedulePrivateSession(workspaceId, sessionId, request)
        } catch (_: IOException) {
            return fail(RescheduleFailure.NotSaved)
        } catch (_: SerializationException) {
            return fail(RescheduleFailure.NotSaved)
        }
        val result = response.body()?.takeIf { response.isSuccessful }
        if (result != null) return _state.update { it.copy(saving = false, moved = result.session) }
        val refused = _state.value.time.refusedBy(response)
        when {
            refused != null -> _state.update { it.copy(saving = false, time = refused) }

            response.code() == HTTP_CONFLICT -> reload(response)

            response.code() == HTTP_FORBIDDEN -> {
                onNotAllowed(response)
                fail(RescheduleFailure.NoPermission)
            }

            else -> fail(RescheduleFailure.NotSaved)
        }
    }

    private fun fail(failure: RescheduleFailure) = _state.update { it.copy(saving = false, failure = failure) }

    // The session was changed first: the form shows it as it is now and the next save uses its version. A trainer
    // conflict (PS-07, #542) has no session to show: until that screen exists it says the move was not saved.
    private fun reload(response: Response<*>) {
        val refusal = runCatching {
            Serializer.kotlinxSerializationJson.decodeFromString<ReschedulePrivateSessionRefusal>(
                response.errorBody()?.string().orEmpty(),
            )
        }.getOrNull() ?: return fail(RescheduleFailure.NotSaved)
        val session = refusal.session?.takeIf { refusal.code != ReschedulePrivateSessionRefusal.Code.TRAINER_CONFLICT }
            ?: return fail(RescheduleFailure.NotSaved)
        val zone = ZoneId.of(session.timeZone)
        val minutes = SessionClock.minutes(session.startsAt, session.endsAt)
        _state.update {
            it.copy(
                session = session,
                time = SessionTime(SessionClock.local(session.startsAt, zone), minutes),
                saving = false,
                failure = if (refusal.code == ReschedulePrivateSessionRefusal.Code.SESSION_CANCELLED) {
                    RescheduleFailure.Cancelled
                } else {
                    RescheduleFailure.Changed(refusal.changedBy?.name)
                },
            )
        }
    }
}

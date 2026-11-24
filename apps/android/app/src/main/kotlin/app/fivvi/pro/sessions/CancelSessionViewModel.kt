package app.fivvi.pro.sessions

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fivvi.api.apis.SessionsApi
import app.fivvi.api.infrastructure.Serializer
import app.fivvi.api.models.CancelPrivateSessionRefusal
import app.fivvi.api.models.CancelPrivateSessionRequest
import app.fivvi.api.models.Locale
import app.fivvi.api.models.Session
import java.io.IOException
import java.net.HttpURLConnection.HTTP_CONFLICT
import java.net.HttpURLConnection.HTTP_FORBIDDEN
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.SerializationException
import kotlinx.serialization.decodeFromString
import retrofit2.Response

/** *Wie annuleert?* */
enum class CancelInitiator { Client, Workspace }

/** What PS-06 shows under the choice: the question about another time, or the confirm step. */
enum class CancelStep { Nudge, Confirm }

/** What a cancellation that didn't happen says. */
sealed interface CancelFailure {
    /** Someone else changed the session first (`409`): [byName] is who, when the API knows. */
    data class Changed(val byName: String?) : CancelFailure

    data object Cancelled : CancelFailure

    data object NoPermission : CancelFailure

    data object NotSaved : CancelFailure

    /** The request couldn't reach the API: nothing is queued. */
    data object Offline : CancelFailure
}

/** What PS-06 shows and holds. */
data class CancelSessionState(
    val session: Session,
    val clientName: String,
    /** The client's address, for the note under the email box; `null` when it isn't known. */
    val clientEmail: String?,
    /** The language the client's emails go out in: their own, else the workspace's default. */
    val emailLocale: Locale,
    /** *Verplaatsen* is on offer: the person may plan sessions. */
    val canReschedule: Boolean,
    /** The session has started: the email box is hidden and nothing is sent. */
    val started: Boolean,
    val initiator: CancelInitiator = CancelInitiator.Client,
    val notify: Boolean = false,
    /** *Toch annuleren* of the question was chosen. */
    val confirming: Boolean = false,
    val failure: CancelFailure? = null,
    val saving: Boolean = false,
    /** The API cancelled the session: PS-06 closes and TD-02 shows the record. */
    val cancelled: Session? = null,
) {
    /** *Wij* goes straight to the confirm step; so does *Toch annuleren*, and a person who may not move sessions. */
    val step: CancelStep
        get() = if (initiator == CancelInitiator.Workspace || confirming || !canReschedule) {
            CancelStep.Confirm
        } else {
            CancelStep.Nudge
        }

    val isOffline: Boolean get() = failure == CancelFailure.Offline

    /** The button works while nothing is being sent, the phone is online and the session can still be cancelled. */
    val canSubmit: Boolean
        get() = step == CancelStep.Confirm && !saving && failure != CancelFailure.Offline &&
            failure != CancelFailure.Cancelled && session.status == Session.Status.SCHEDULED
}

/**
 * PS-06 *Sessie annuleren?* (F026 AC1, AC1a, AC2, AC4): who is cancelling (*De klant* or *Wij*), whether the client gets an
 * email (off for *De klant*, on for *Wij*, changeable), and, with *De klant* chosen, first the question *Al een ander moment
 * voorgesteld?* with **Verplaatsen** and *Toch annuleren*. The API cancels it (`POST …/cancel`) with the `version` the person
 * saw and decides every rule; a `409` says who changed the session or that it was cancelled already, and the form shows the
 * session as it is now. A session that has started has no email box and sends nothing. Nothing is queued when the phone is
 * offline: the button is off.
 */
class CancelSessionViewModel(
    private val api: SessionsApi,
    private val workspaceId: UUID,
    session: Session,
    clientName: String,
    clientEmail: String?,
    emailLocale: Locale,
    canReschedule: Boolean,
    now: Instant = Instant.now(),
    private val onNotAllowed: (Response<*>) -> Unit = {},
) : ViewModel() {
    private val _state = MutableStateFlow(
        CancelSessionState(
            session = session,
            clientName = clientName,
            clientEmail = clientEmail,
            emailLocale = emailLocale,
            canReschedule = canReschedule,
            started = !session.startsAt.toInstant().isAfter(now),
        ),
    )
    val state: StateFlow<CancelSessionState> = _state.asStateFlow()

    /** The email box follows who cancels: off for the client's own cancellation, on when we cancel. */
    fun choose(initiator: CancelInitiator) = _state.update {
        it.copy(
            initiator = initiator,
            notify = initiator == CancelInitiator.Workspace,
            failure = it.failure.takeIf { failure -> failure == CancelFailure.Offline },
        )
    }

    fun setNotify(notify: Boolean) = _state.update { it.copy(notify = notify) }

    /** *Toch annuleren* of the question. */
    fun cancelAnyway() = _state.update { it.copy(confirming = true) }

    /** The cancellation was handed on: it isn't handed on again. */
    fun onCancelledHandled() = _state.update { it.copy(cancelled = null) }

    /** Cancels the session. When the API cancelled it, [CancelSessionState.cancelled] has it; otherwise the state says why. */
    fun cancel() {
        val shown = _state.value
        if (shown.saving || shown.session.status != Session.Status.SCHEDULED) return
        _state.update { it.copy(failure = null, saving = true) }
        val request = CancelPrivateSessionRequest(
            initiator = if (shown.initiator == CancelInitiator.Client) {
                CancelPrivateSessionRequest.Initiator.CLIENT
            } else {
                CancelPrivateSessionRequest.Initiator.WORKSPACE
            },
            // A session that has started sends nothing, whatever the box said.
            notify = shown.notify && !shown.started,
            version = shown.session.version,
            surface = CancelPrivateSessionRequest.Surface.ANDROID,
        )
        viewModelScope.launch { send(shown.session.id, request) }
    }

    private suspend fun send(sessionId: UUID, request: CancelPrivateSessionRequest) {
        val response = try {
            api.cancelPrivateSession(workspaceId, sessionId, request)
        } catch (_: IOException) {
            return fail(CancelFailure.Offline)
        } catch (_: SerializationException) {
            return fail(CancelFailure.NotSaved)
        }
        val result = response.body()?.takeIf { response.isSuccessful }
        when {
            result != null -> _state.update { it.copy(saving = false, cancelled = result.session) }

            response.code() == HTTP_CONFLICT -> reload(response)

            response.code() == HTTP_FORBIDDEN -> {
                onNotAllowed(response)
                fail(CancelFailure.NoPermission)
            }

            else -> fail(CancelFailure.NotSaved)
        }
    }

    private fun fail(failure: CancelFailure) = _state.update { it.copy(saving = false, failure = failure) }

    // The session was changed or cancelled first: the form shows it as it is now and the next try uses its version.
    private fun reload(response: Response<*>) {
        val refusal = runCatching {
            Serializer.kotlinxSerializationJson.decodeFromString<CancelPrivateSessionRefusal>(
                response.errorBody()?.string().orEmpty(),
            )
        }.getOrNull() ?: return fail(CancelFailure.NotSaved)
        _state.update {
            it.copy(
                session = refusal.session,
                saving = false,
                failure = if (refusal.code == CancelPrivateSessionRefusal.Code.SESSION_CANCELLED) {
                    CancelFailure.Cancelled
                } else {
                    CancelFailure.Changed(refusal.changedBy?.name)
                },
            )
        }
    }
}

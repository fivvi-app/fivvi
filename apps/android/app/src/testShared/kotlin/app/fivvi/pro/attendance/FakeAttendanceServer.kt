package app.fivvi.pro.attendance

import app.fivvi.api.apis.SessionsApi
import app.fivvi.api.models.Attendance
import app.fivvi.api.models.AttendanceParticipant
import app.fivvi.api.models.AttendanceRefusal
import app.fivvi.api.models.AttendanceSummary
import app.fivvi.api.models.AttendanceTooEarly
import app.fivvi.api.models.MarkEveryoneAttendedRequest
import app.fivvi.api.models.SetAttendanceRequest
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import retrofit2.Response

private val JSON = "application/json".toMediaType()

/** The ID the fakes give the participant of this name. */
fun participantIdOf(name: String): UUID = UUID.nameUUIDFromBytes("participant:$name".toByteArray())

/** A request the fake API got: [clientId] and [status] are `null` for *Iedereen aanwezig*. */
data class SentAttendance(
    val workspaceId: UUID,
    val sessionId: UUID,
    val clientId: UUID?,
    val status: SetAttendanceRequest.Status?,
    val requestId: UUID,
    val surface: String?,
)

/** One session's attendance as the API holds it. */
class FakeAttendance(
    val sessionId: UUID,
    val type: Attendance.Type = Attendance.Type.GROUP,
    var cancelled: Boolean = false,
    var opensAt: OffsetDateTime,
    var canTake: Boolean = true,
    val participants: MutableList<AttendanceParticipant> = mutableListOf(),
) {
    fun answer(): Attendance {
        fun count(status: AttendanceParticipant.Status) = participants.count { it.status == status }
        return Attendance(
            sessionId,
            type,
            if (cancelled) Attendance.Status.CANCELLED else Attendance.Status.SCHEDULED,
            opensAt,
            canTake,
            participants.toList(),
            AttendanceSummary(
                count(AttendanceParticipant.Status.ATTENDED),
                count(AttendanceParticipant.Status.NO_SHOW),
                count(AttendanceParticipant.Status.BOOKED),
                count(AttendanceParticipant.Status.CANCELLED),
            ),
        )
    }
}

/**
 * The attendance routes of the fake [SessionsApi], with the rules of the real ones that the app depends on: attendance opens
 * at [FakeAttendance.opensAt], a cancelled session answers `409 session_cancelled`, a cancelled participant `409
 * participant_cancelled`, a request ID that was stored once stores nothing the second time, *Iedereen aanwezig* sets only the
 * participants still *Geboekt*. A queued answer replaces the answer of the next call; [failure] makes every call fail.
 */
class FakeAttendanceServer {
    val sessions = mutableMapOf<UUID, FakeAttendance>()
    val sent = mutableListOf<SentAttendance>()
    val reads = mutableListOf<UUID>()
    val answers = ArrayDeque<suspend () -> Response<Attendance>>()
    var failure: Exception? = null

    /** While set, the read of the participants answers with this status. */
    var listStatus: Int? = null
    var now: Instant = Instant.parse("2026-09-22T16:35:00Z")
    private val seen = mutableSetOf<UUID>()

    fun add(attendance: FakeAttendance) = attendance.also { sessions[it.sessionId] = it }

    suspend fun list(sessionId: UUID): Response<Attendance> {
        reads += sessionId
        failure?.let { throw it }
        listStatus?.let { return status(it) }
        return sessions[sessionId]?.let { Response.success(it.answer()) }
            ?: Response.error(404, "{}".toResponseBody(JSON))
    }

    suspend fun set(
        workspaceId: UUID,
        sessionId: UUID,
        clientId: UUID,
        request: SetAttendanceRequest,
    ): Response<Attendance> {
        sent += SentAttendance(
            workspaceId,
            sessionId,
            clientId,
            request.status,
            request.clientRequestId,
            request.surface?.value,
        )
        failure?.let { throw it }
        if (answers.isNotEmpty()) return answers.removeFirst()()
        val held = sessions[sessionId] ?: return Response.error(404, "{}".toResponseBody(JSON))
        refusal(held)?.let { return it }
        val index = held.participants.indexOfFirst { it.clientId == clientId }
        if (index < 0) return Response.error(404, "{}".toResponseBody(JSON))
        if (held.participants[index].status ==
            AttendanceParticipant.Status.CANCELLED
        ) {
            return refused("participant_cancelled")
        }
        if (seen.add(request.clientRequestId)) {
            val status = when (request.status) {
                SetAttendanceRequest.Status.BOOKED -> AttendanceParticipant.Status.BOOKED
                SetAttendanceRequest.Status.ATTENDED -> AttendanceParticipant.Status.ATTENDED
                SetAttendanceRequest.Status.NO_SHOW -> AttendanceParticipant.Status.NO_SHOW
            }
            held.participants[index] = held.participants[index].copy(status = status)
        }
        return Response.success(held.answer())
    }

    suspend fun everyone(
        workspaceId: UUID,
        sessionId: UUID,
        request: MarkEveryoneAttendedRequest,
    ): Response<Attendance> {
        sent += SentAttendance(workspaceId, sessionId, null, null, request.clientRequestId, request.surface?.value)
        failure?.let { throw it }
        if (answers.isNotEmpty()) return answers.removeFirst()()
        val held = sessions[sessionId] ?: return Response.error(404, "{}".toResponseBody(JSON))
        refusal(held)?.let { return it }
        if (seen.add(request.clientRequestId)) {
            held.participants.replaceAll {
                if (it.status == AttendanceParticipant.Status.BOOKED) {
                    it.copy(status = AttendanceParticipant.Status.ATTENDED)
                } else {
                    it
                }
            }
        }
        return Response.success(held.answer())
    }

    private fun refusal(held: FakeAttendance): Response<Attendance>? = when {
        held.cancelled -> refused("session_cancelled")
        now.isBefore(held.opensAt.toInstant()) -> tooEarly(held.opensAt)
        else -> null
    }

    companion object {
        fun refused(code: String): Response<Attendance> {
            val code2 = AttendanceRefusal.Code.entries.first { it.value == code }
            val body = app.fivvi.api.infrastructure.Serializer.kotlinxSerializationJson
                .encodeToString(AttendanceRefusal.serializer(), AttendanceRefusal(code2))
            return Response.error(409, body.toResponseBody(JSON))
        }

        fun tooEarly(opensAt: OffsetDateTime): Response<Attendance> {
            val body = app.fivvi.api.infrastructure.Serializer.kotlinxSerializationJson.encodeToString(
                AttendanceTooEarly.serializer(),
                AttendanceTooEarly(AttendanceTooEarly.Code.ATTENDANCE_TOO_EARLY, opensAt),
            )
            return Response.error(422, body.toResponseBody(JSON))
        }

        fun status(code: Int): Response<Attendance> = Response.error(code, "{}".toResponseBody(JSON))

        fun participant(name: String, status: AttendanceParticipant.Status = AttendanceParticipant.Status.BOOKED) =
            AttendanceParticipant(participantIdOf(name), name, status)

        /** [instant] in the offset the API sends it in. */
        fun at(instant: Instant): OffsetDateTime = instant.atOffset(ZoneOffset.UTC)
    }
}

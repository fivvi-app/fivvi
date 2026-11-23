package app.fivvi.pro.sessions

import app.fivvi.api.apis.LocationsApi
import app.fivvi.api.apis.SessionsApi
import app.fivvi.api.models.AddressLookupResult
import app.fivvi.api.models.AssignTrainerRequest
import app.fivvi.api.models.Attendance
import app.fivvi.api.models.Client
import app.fivvi.api.models.Location
import app.fivvi.api.models.LocationAddress
import app.fivvi.api.models.LocationType
import app.fivvi.api.models.MarkEveryoneAttendedRequest
import app.fivvi.api.models.PlanPrivateSessionRequest
import app.fivvi.api.models.PlannedPrivateSession
import app.fivvi.api.models.ReschedulePrivateSessionRequest
import app.fivvi.api.models.ReschedulePrivateSessionResult
import app.fivvi.api.models.Session
import app.fivvi.api.models.SessionParticipant
import app.fivvi.api.models.SessionTrainer
import app.fivvi.api.models.SetAttendanceRequest
import app.fivvi.api.models.Trainer
import app.fivvi.api.models.TrainerAssigned
import app.fivvi.api.models.TrainerCandidates
import app.fivvi.api.models.TrainerConflict
import app.fivvi.api.models.TrainerConflictItem
import app.fivvi.api.models.UpcomingSessions
import app.fivvi.api.models.UpdateLocationRequest
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.util.UUID
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import retrofit2.Response

private val JSON = "application/json".toMediaType()

/** The ID the fakes give the session of this name, so a test can name it without keeping it. */
fun sessionIdOf(name: String): UUID = UUID.nameUUIDFromBytes("session:$name".toByteArray())

/** The team-member ID the fakes give the trainer of this name. */
fun trainerIdOf(name: String): UUID = UUID.nameUUIDFromBytes("trainer:$name".toByteArray())

fun trainerOf(name: String) = Trainer(trainerIdOf(name), name)

/** John's Gym, with a synthetic address (a location without one has no Route). */
fun gymLocation(address: LocationAddress? = LocationAddress("1011AB", "1", null, "Damrak", "Amsterdam")) = Location(
    UUID.nameUUIDFromBytes("location:John's Gym".toByteArray()),
    "John's Gym",
    LocationType.ORGANIZATION_LOCATION,
    address,
    true,
)

/** A private session of [client] with [trainer] at the wall clock [start] in Amsterdam, as the API returns it. */
fun sessionOf(
    id: UUID = sessionIdOf("anna"),
    client: Client,
    trainer: Trainer? = trainerOf("Sarah"),
    start: LocalDateTime = LocalDateTime.of(2026, 9, 24, 9, 0),
    minutes: Int = 60,
    version: Int = 1,
    status: Session.Status = Session.Status.SCHEDULED,
    location: Location = gymLocation(),
    zone: String = "Europe/Amsterdam",
): Session {
    val begin = start.atZone(ZoneId.of(zone)).toOffsetDateTime()
    return Session(
        id,
        Session.Type.PRIVATE,
        status,
        begin,
        begin.plusMinutes(minutes.toLong()),
        zone,
        1,
        version,
        location,
        listOf(SessionParticipant(client.id, client.name, SessionParticipant.AttendanceStatus.BOOKED)),
        trainer?.let { SessionTrainer(it.id, it.name) },
    )
}

/**
 * The generated client's own API interface for tests: it holds [sessions] and answers a read, a plan and a move from them
 * (the planning rules are the API's own and tested there; here a request is taken as it is, at the wall clock of
 * Amsterdam, with the version counted up). The one rule it models is the double booking of F023 AC7: a save that would
 * overlap another scheduled session of the same trainer answers `409 trainer_conflict` with those sessions, unless the
 * request says `allowConflicts`; back-to-back and cancelled sessions never overlap. A queued answer replaces the answer of
 * the next call; [failure] makes every call fail with that exception (no connection).
 */
class FakeSessionsApi : SessionsApi {
    val sessions = mutableMapOf<UUID, Session>()
    var location = gymLocation()
    val clients = mutableMapOf<UUID, Client>()
    val trainers = mutableMapOf<UUID, Trainer>()

    /** The trainer of a planned session when the request names none: the person who plans it. */
    var me: Trainer = trainerOf("Sarah")
    val created = mutableListOf<Pair<UUID, PlanPrivateSessionRequest>>()
    val moved = mutableListOf<Triple<UUID, UUID, ReschedulePrivateSessionRequest>>()
    val read = mutableListOf<UUID>()

    /** The workspace and the ID of every session read: a screen of Vandaag asks in the workspace of its item (F013 AC4). */
    val readIn = mutableListOf<Pair<UUID, UUID>>()
    val createAnswers = ArrayDeque<suspend (PlanPrivateSessionRequest) -> Response<PlannedPrivateSession>>()
    val rescheduleAnswers = ArrayDeque<
        suspend (
            UUID,
            ReschedulePrivateSessionRequest,
        ) -> Response<ReschedulePrivateSessionResult>,
        >()
    val upcoming = mutableMapOf<UUID, UpcomingSessions>()
    val upcomingRead = mutableListOf<UUID>()

    /** While set, every call fails with it (a lost connection). */
    var failure: Exception? = null

    /** While set, the read of a session answers with this status. */
    var getStatus: Int? = null

    /** While set, the upcoming sessions answer with this status. */
    var upcomingStatus: Int? = null

    override suspend fun createPrivateSession(
        workspaceId: UUID,
        planPrivateSessionRequest: PlanPrivateSessionRequest,
    ): Response<PlannedPrivateSession> {
        created += workspaceId to planPrivateSessionRequest
        failure?.let { throw it }
        if (createAnswers.isNotEmpty()) return createAnswers.removeFirst()(planPrivateSessionRequest)
        val client = clients[planPrivateSessionRequest.clientId]
            ?: return Response.error(404, "{}".toResponseBody(JSON))
        val trainer = planPrivateSessionRequest.trainerId?.let { trainers[it] } ?: me
        val session = sessionOf(
            id = UUID.randomUUID(),
            client = client,
            trainer = trainer,
            start = LocalDateTime.of(
                LocalDate.parse(planPrivateSessionRequest.localDate),
                LocalTime.parse(planPrivateSessionRequest.localStart),
            ),
            minutes = planPrivateSessionRequest.durationMinutes,
            location = location,
        )
        if (planPrivateSessionRequest.allowConflicts != true) {
            overlapsOf(trainer.id, session, excluding = null).takeIf { it.isNotEmpty() }
                ?.let { return trainerConflict(it) }
        }
        sessions[session.id] = session
        return Response.success(
            201,
            PlannedPrivateSession(
                session,
                past = false,
                repeatedStart = false,
                confirmationEmail = planPrivateSessionRequest.notify,
            ),
        )
    }

    override suspend fun getSession(workspaceId: UUID, sessionId: UUID): Response<Session> {
        read += sessionId
        readIn += workspaceId to sessionId
        failure?.let { throw it }
        getStatus?.let { return Response.error(it, "{}".toResponseBody(JSON)) }
        return sessions[sessionId]?.let { Response.success(it) } ?: Response.error(404, "{}".toResponseBody(JSON))
    }

    override suspend fun assignTrainer(
        workspaceId: UUID,
        sessionId: UUID,
        assignTrainerRequest: AssignTrainerRequest,
    ): Response<TrainerAssigned> = error("FakeSessionsApi.assignTrainer is not expected in this test")

    override suspend fun listTrainerCandidates(workspaceId: UUID, sessionId: UUID): Response<TrainerCandidates> =
        error("FakeSessionsApi.listTrainerCandidates is not expected in this test")

    override suspend fun listSessionParticipants(workspaceId: UUID, sessionId: UUID): Response<Attendance> =
        error("FakeSessionsApi.listSessionParticipants is not expected in this test")

    override suspend fun setParticipantAttendance(
        workspaceId: UUID,
        sessionId: UUID,
        clientId: UUID,
        setAttendanceRequest: SetAttendanceRequest,
    ): Response<Attendance> = error("FakeSessionsApi.setParticipantAttendance is not expected in this test")

    override suspend fun markEveryoneAttended(
        workspaceId: UUID,
        sessionId: UUID,
        markEveryoneAttendedRequest: MarkEveryoneAttendedRequest,
    ): Response<Attendance> = error("FakeSessionsApi.markEveryoneAttended is not expected in this test")

    override suspend fun listClientUpcomingSessions(workspaceId: UUID, clientId: UUID): Response<UpcomingSessions> {
        upcomingRead += clientId
        failure?.let { throw it }
        upcomingStatus?.let { return Response.error(it, "{}".toResponseBody(JSON)) }
        return Response.success(upcoming[clientId] ?: UpcomingSessions(clientId, "Europe/Amsterdam", emptyList()))
    }

    override suspend fun reschedulePrivateSession(
        workspaceId: UUID,
        sessionId: UUID,
        reschedulePrivateSessionRequest: ReschedulePrivateSessionRequest,
    ): Response<ReschedulePrivateSessionResult> {
        moved += Triple(workspaceId, sessionId, reschedulePrivateSessionRequest)
        failure?.let { throw it }
        if (rescheduleAnswers.isNotEmpty()) {
            return rescheduleAnswers.removeFirst()(
                sessionId,
                reschedulePrivateSessionRequest,
            )
        }
        val old = sessions.getValue(sessionId)
        val client = clients.getValue(old.participants.single().clientId)
        val session = sessionOf(
            id = sessionId,
            client = client,
            trainer = old.trainer?.let { Trainer(it.id, it.name) },
            start = LocalDateTime.of(
                LocalDate.parse(reschedulePrivateSessionRequest.localDate),
                LocalTime.parse(reschedulePrivateSessionRequest.localStart),
            ),
            minutes = reschedulePrivateSessionRequest.durationMinutes,
            version = old.version + 1,
            location = old.location,
        )
        if (reschedulePrivateSessionRequest.allowConflicts != true) {
            old.trainer?.let { overlapsOf(it.id, session, excluding = sessionId) }?.takeIf { it.isNotEmpty() }
                ?.let { return trainerConflict(it) }
        }
        sessions[sessionId] = session
        return Response.success(
            ReschedulePrivateSessionResult(
                session,
                past = false,
                repeatedStart = false,
                changeEmail = reschedulePrivateSessionRequest.notify,
            ),
        )
    }

    /** `400 validation_failed` with these issues: path to code. */
    fun <T> refused(vararg issues: Pair<String, String>): Response<T> {
        val list = issues.joinToString(",") { (path, code) -> """{"path":"$path","code":"$code"}""" }
        return Response.error(400, """{"code":"validation_failed","issues":[$list]}""".toResponseBody(JSON))
    }

    /** `409 session_changed` (or `session_cancelled`) with the session as it is now and who changed it. */
    fun <T> conflict(session: Session, changedBy: String? = null, code: String = "session_changed"): Response<T> {
        val sessionJson = app.fivvi.api.infrastructure.Serializer.kotlinxSerializationJson
            .encodeToString(Session.serializer(), session)
        val who = changedBy?.let { ""","changedBy":{"name":"$it"}""" }.orEmpty()
        return Response.error(409, """{"code":"$code","session":$sessionJson$who}""".toResponseBody(JSON))
    }

    /** `409 trainer_conflict`: the trainer already has these sessions at that time (PS-07 words them). */
    fun <T> trainerConflict(conflicts: List<TrainerConflictItem> = emptyList()): Response<T> {
        val body = app.fivvi.api.infrastructure.Serializer.kotlinxSerializationJson.encodeToString(
            TrainerConflict.serializer(),
            TrainerConflict(TrainerConflict.Code.TRAINER_CONFLICT, conflicts),
        )
        return Response.error(409, body.toResponseBody(JSON))
    }

    // The API's rule (F023 AC7), for the fake's own sessions: the trainer's scheduled sessions that overlap [session],
    // soonest first; a session that starts when the other ends does not overlap, and a cancelled one never does.
    fun overlapsOf(trainerId: UUID, session: Session, excluding: UUID?): List<TrainerConflictItem> = sessions.values
        .filter { it.status == Session.Status.SCHEDULED && it.id != excluding && it.trainer?.id == trainerId }
        .filter { it.startsAt < session.endsAt && session.startsAt < it.endsAt }
        .sortedBy { it.startsAt }
        .map {
            val group = it.groupClass
            if (group != null) {
                TrainerConflictItem(
                    it.id,
                    TrainerConflictItem.Type.GROUP,
                    it.startsAt,
                    it.endsAt,
                    group.nameNl,
                    group.nameEn,
                )
            } else {
                TrainerConflictItem(
                    it.id,
                    TrainerConflictItem.Type.PRIVATE,
                    it.startsAt,
                    it.endsAt,
                    it.participants.firstOrNull()?.name.orEmpty(),
                    null,
                )
            }
        }

    fun <T> status(code: Int): Response<T> = Response.error(code, "{}".toResponseBody(JSON))
}

/** The locations of the workspace: John's Gym by default. */
class FakeLocationsApi : LocationsApi {
    var locations = listOf(gymLocation())
    var failure: Exception? = null
    var status: Int? = null
    var calls = 0
        private set

    override suspend fun listLocations(workspaceId: UUID): Response<List<Location>> {
        calls++
        failure?.let { throw it }
        status?.let { return Response.error(it, "{}".toResponseBody(JSON)) }
        return Response.success(locations)
    }

    override suspend fun lookupAddress(
        workspaceId: UUID,
        postcode: String,
        houseNumber: String,
        addition: String?,
    ): Response<AddressLookupResult> = error("FakeLocationsApi.lookupAddress is not expected in this test")

    override suspend fun updateLocation(
        workspaceId: UUID,
        locationId: UUID,
        updateLocationRequest: UpdateLocationRequest,
    ): Response<Location> = error("FakeLocationsApi.updateLocation is not expected in this test")
}

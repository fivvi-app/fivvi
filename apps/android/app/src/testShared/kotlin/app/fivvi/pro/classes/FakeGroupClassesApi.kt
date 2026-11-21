package app.fivvi.pro.classes

import app.fivvi.api.apis.GroupClassesApi
import app.fivvi.api.models.ClassSeries
import app.fivvi.api.models.CreateGroupClassRequest
import app.fivvi.api.models.CreatedGroupClass
import app.fivvi.api.models.FirstGroupClassDate
import app.fivvi.api.models.GroupClass
import app.fivvi.api.models.Location
import app.fivvi.api.models.ScheduleGroupClassDateRequest
import app.fivvi.api.models.ScheduledClassDate
import app.fivvi.api.models.Session
import app.fivvi.api.models.SessionGroupClass
import app.fivvi.api.models.SessionParticipant
import app.fivvi.api.models.SessionSeries
import app.fivvi.api.models.SessionTrainer
import app.fivvi.api.models.Trainer
import app.fivvi.api.models.UpdateGroupClassDateRequest
import app.fivvi.api.models.UpdateGroupClassRequest
import app.fivvi.api.models.UpdatedClassDate
import app.fivvi.pro.sessions.FakeSessionsApi
import app.fivvi.pro.sessions.gymLocation
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.TextStyle
import java.util.Locale
import java.util.UUID
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import retrofit2.Response

private val JSON = "application/json".toMediaType()

/** The weeks a weekly class puts in the calendar (the API's own, F022). */
const val WEEKLY_DATES = 12

/** The ID the fakes give the class of this name. */
fun classIdOf(name: String): UUID = UUID.nameUUIDFromBytes("class:$name".toByteArray())

/** The class "Mobility" (or another) as the API returns it. */
fun groupClassOf(
    name: String,
    nameEn: String? = null,
    descriptionNl: String? = null,
    descriptionEn: String? = null,
    trainer: Trainer? = null,
    capacity: Int = 12,
    minutes: Int = 60,
) = GroupClass(
    classIdOf(name),
    name,
    nameEn,
    descriptionNl,
    descriptionEn,
    capacity,
    minutes,
    trainer?.let { SessionTrainer(it.id, it.name) },
)

/**
 * A class on a date as the API returns it (type `group`): [booked] is the number of clients who hold a place, the others
 * of [cancelled] have cancelled theirs.
 */
fun classDateOf(
    id: UUID,
    groupClass: GroupClass,
    trainer: Trainer? = groupClass.defaultTrainer?.let { Trainer(it.id, it.name) },
    start: LocalDateTime = LocalDateTime.of(2026, 9, 24, 18, 0),
    minutes: Int = groupClass.durationMinutes,
    capacity: Int = groupClass.capacity,
    booked: Int = 0,
    cancelled: Int = 0,
    location: Location = gymLocation(),
    zone: String = "Europe/Amsterdam",
    series: SessionSeries? = null,
): Session {
    val begin = start.atZone(ZoneId.of(zone)).toOffsetDateTime()
    fun participant(index: Int, status: SessionParticipant.AttendanceStatus) =
        SessionParticipant(UUID.nameUUIDFromBytes("client:$index".toByteArray()), "Client $index", status)
    return Session(
        id,
        Session.Type.GROUP,
        Session.Status.SCHEDULED,
        begin,
        begin.plusMinutes(minutes.toLong()),
        zone,
        capacity,
        1,
        location,
        List(booked) { participant(it, SessionParticipant.AttendanceStatus.BOOKED) } +
            List(cancelled) { participant(booked + it, SessionParticipant.AttendanceStatus.CANCELLED) },
        trainer?.let { SessionTrainer(it.id, it.name) },
        SessionGroupClass(groupClass.id, groupClass.nameNl, groupClass.nameEn),
        series,
    )
}

/**
 * The generated client's own API interface for tests: it creates a class and its first date from the request, as the API
 * does in one request (the rules are the API's own and tested there; a request is taken as it is, at the wall clock of
 * Amsterdam), puts the date among the [sessions] of the fake sessions API so TD-03 reads it, and answers the read of a
 * class from [classes]. The one rule it models is the double booking of F023 AC7: a date that would overlap another
 * scheduled session of the same trainer answers `409 trainer_conflict`, unless the request says `allowConflicts`. A first
 * date that repeats weekly (F022) makes [WEEKLY_DATES] dates a week apart at the same wall clock, each with its series
 * (`datesAdded` 12), unless [skippedStart] names a date the clocks skip: then the API refuses with that date and stores
 * nothing. A queued answer replaces the answer of the next create; [failure] makes every call fail (no connection).
 */
class FakeGroupClassesApi(private val sessions: FakeSessionsApi) : GroupClassesApi {
    val classes = mutableMapOf<UUID, GroupClass>()
    val created = mutableListOf<Pair<UUID, CreateGroupClassRequest>>()
    val read = mutableListOf<UUID>()
    val createAnswers = ArrayDeque<suspend (CreateGroupClassRequest) -> Response<CreatedGroupClass>>()

    /** While set, every call fails with it (a lost connection). */
    var failure: Exception? = null

    /** The date a weekly class's start falls on when the clocks skip it: the API refuses and names it (F022 AC7). */
    var skippedStart: LocalDate? = null

    /** While set, the read of a class answers with this status. */
    var getStatus: Int? = null

    override suspend fun createGroupClass(
        workspaceId: UUID,
        createGroupClassRequest: CreateGroupClassRequest,
    ): Response<CreatedGroupClass> {
        created += workspaceId to createGroupClassRequest
        failure?.let { throw it }
        if (createAnswers.isNotEmpty()) return createAnswers.removeFirst()(createGroupClassRequest)
        val trainer = createGroupClassRequest.trainerId?.let { sessions.trainers[it] }
        val groupClass = GroupClass(
            UUID.randomUUID(),
            createGroupClassRequest.nameNl,
            createGroupClassRequest.nameEn,
            createGroupClassRequest.descriptionNl,
            createGroupClassRequest.descriptionEn,
            createGroupClassRequest.capacity,
            createGroupClassRequest.durationMinutes,
            trainer?.let { SessionTrainer(it.id, it.name) },
        )
        val first = createGroupClassRequest.firstDate
        val weekly = first?.repeat == FirstGroupClassDate.Repeat.WEEKLY
        val skipped = skippedStart
        if (weekly && skipped != null) {
            return Response.error(
                400,
                (
                    """{"code":"validation_failed","issues":[{"path":"firstDate.localStart",""" +
                        """"code":"time_does_not_exist","date":"$skipped"}]}"""
                    ).toResponseBody(JSON),
            )
        }
        val start = first?.let { LocalDateTime.of(LocalDate.parse(it.localDate), LocalTime.parse(it.localStart)) }
        val dates = start?.let { begin ->
            val weeks = if (weekly) WEEKLY_DATES else 1
            val seriesId = UUID.randomUUID()
            List(weeks) { week ->
                val at = begin.plusWeeks(week.toLong())
                classDateOf(
                    UUID.randomUUID(),
                    groupClass,
                    trainer,
                    at,
                    location = sessions.location,
                    series = SessionSeries(
                        seriesId,
                        weekdayOf(begin.toLocalDate()),
                        first.localStart,
                        at.toLocalDate().toString(),
                        emptyList(),
                    ).takeIf { weekly },
                )
            }
        }.orEmpty()
        val date = dates.firstOrNull()
        if (date != null && trainer != null && createGroupClassRequest.allowConflicts != true) {
            val clashes = dates.map {
                sessions.overlapsOf(trainer.id, it, excluding = null)
            }.firstOrNull { it.isNotEmpty() }
            if (clashes != null) return sessions.trainerConflict(clashes)
        }
        classes[groupClass.id] = groupClass
        dates.forEach { sessions.sessions[it.id] = it }
        return Response.success(201, CreatedGroupClass(groupClass, date, dates.size.takeIf { weekly }))
    }

    private fun weekdayOf(date: LocalDate): SessionSeries.Weekday = SessionSeries.Weekday.valueOf(
        date.dayOfWeek.getDisplayName(TextStyle.SHORT, Locale.ENGLISH).take(2).uppercase(),
    )

    override suspend fun getGroupClass(workspaceId: UUID, classId: UUID): Response<GroupClass> {
        read += classId
        failure?.let { throw it }
        getStatus?.let { return Response.error(it, "{}".toResponseBody(JSON)) }
        return classes[classId]?.let { Response.success(it) } ?: Response.error(404, "{}".toResponseBody(JSON))
    }

    override suspend fun listGroupClassSeries(workspaceId: UUID, classId: UUID): Response<List<ClassSeries>> =
        error("FakeGroupClassesApi.listGroupClassSeries is not expected in this test")

    override suspend fun listGroupClasses(workspaceId: UUID): Response<List<GroupClass>> =
        error("FakeGroupClassesApi.listGroupClasses is not expected in this test")

    override suspend fun scheduleGroupClassDate(
        workspaceId: UUID,
        classId: UUID,
        scheduleGroupClassDateRequest: ScheduleGroupClassDateRequest,
    ): Response<ScheduledClassDate> = error("FakeGroupClassesApi.scheduleGroupClassDate is not expected in this test")

    override suspend fun updateGroupClass(
        workspaceId: UUID,
        classId: UUID,
        updateGroupClassRequest: UpdateGroupClassRequest,
    ): Response<GroupClass> = error("FakeGroupClassesApi.updateGroupClass is not expected in this test")

    override suspend fun updateGroupClassDate(
        workspaceId: UUID,
        sessionId: UUID,
        updateGroupClassDateRequest: UpdateGroupClassDateRequest,
    ): Response<UpdatedClassDate> = error("FakeGroupClassesApi.updateGroupClassDate is not expected in this test")
}

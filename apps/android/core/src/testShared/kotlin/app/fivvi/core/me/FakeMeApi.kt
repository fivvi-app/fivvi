package app.fivvi.core.me

import app.fivvi.api.apis.MeApi
import app.fivvi.api.models.ConfirmEmailChange
import app.fivvi.api.models.MeResponse
import app.fivvi.api.models.MeWorkspace
import app.fivvi.api.models.MyDay
import app.fivvi.api.models.MyDaySummary
import app.fivvi.api.models.MySessions
import app.fivvi.api.models.MyWorkspace
import app.fivvi.api.models.PersonalSession
import app.fivvi.api.models.RequestEmailChange
import app.fivvi.api.models.TrainerWord
import app.fivvi.api.models.UpdateMeRequest
import java.util.UUID
import kotlinx.coroutines.CompletableDeferred
import okhttp3.ResponseBody.Companion.toResponseBody
import retrofit2.Response

/** The ID the fakes give the workspace of this name, so a test can name it without keeping it. */
fun workspaceIdOf(name: String): UUID = UUID.nameUUIDFromBytes(name.toByteArray())

/** The person's own team-member ID in the workspace [name] (synthetic): one per workspace, unless a test gives another. */
fun teamMemberIdOf(name: String): UUID = UUID.nameUUIDFromBytes("member of $name".toByteArray())

/** The generated client's own API interface, answering each call with the next queued answer. */
class FakeMeApi : MeApi {
    /** The stored language of an account answered without one: the activity tests set the phone's, so it changes nothing. */
    var defaultPreferredLocale = MeResponse.PreferredLocale.NL_NL

    val answers = ArrayDeque<suspend () -> Response<MeResponse>>()
    var calls = 0
        private set

    override suspend fun getMe(): Response<MeResponse> {
        calls++
        val answer = answers.removeFirstOrNull()
            ?: error("FakeMeApi.getMe has no answer: the app asked for call $calls")
        return answer()
    }

    /** Every `PATCH /v1/me` body received, in order. */
    val updates = mutableListOf<UpdateMeRequest>()

    /** What `PATCH /v1/me` answers; it fails with this exception when set. */
    var updateFailure: Exception? = null

    /** When set, `PATCH /v1/me` waits for this before it answers, so a test can act while the save is under way. */
    var updateGate: CompletableDeferred<Unit>? = null

    override suspend fun updateMe(updateMeRequest: UpdateMeRequest): Response<MeResponse> {
        updates += updateMeRequest
        updateGate?.await()
        updateFailure?.let { throw it }
        updateAnswers.removeFirstOrNull()?.let { return it() }
        return Response.success(
            MeResponse(
                id = UUID.randomUUID(),
                email = "owner@example.com",
                name = updateMeRequest.name ?: "Owner",
                preferredLocale = if (updateMeRequest.preferredLocale == UpdateMeRequest.PreferredLocale.EN) {
                    MeResponse.PreferredLocale.EN
                } else {
                    MeResponse.PreferredLocale.NL_NL
                },
                bookingEmails = true,
                canCreateWorkspace = false,
                workspaces = emptyList(),
                clientWorkspaces = emptyList(),
            ),
        )
    }

    /** Answers for `PATCH /v1/me`, used before the default answer (the account with the changed name and language). */
    val updateAnswers = ArrayDeque<suspend () -> Response<MeResponse>>()

    /** `PATCH /v1/me` refuses the next change with `400 validation_failed` on [path] with the issue [code] (`too_small`, `too_big`). */
    fun refuseNextUpdate(path: String = "name", code: String) {
        updateAnswers += {
            Response.error(
                400,
                """{"code":"validation_failed","issues":[{"path":"$path","code":"$code"}]}""".toResponseBody(),
            )
        }
    }

    /** Changing the email address (F005) has no screen on Android yet, so no test expects it. */
    override suspend fun requestEmailChange(requestEmailChange: RequestEmailChange): Response<Unit> =
        error("FakeMeApi.requestEmailChange is not expected in this test")

    override suspend fun confirmEmailChange(confirmEmailChange: ConfirmEmailChange): Response<MeResponse> =
        error("FakeMeApi.confirmEmailChange is not expected in this test")

    /** What `GET /v1/me/day` answers: [day] while it is set, and while [dayFailure] is not, otherwise a day with no sessions. */
    var day: MyDay? = null

    /** `GET /v1/me/day` fails with this instead: an `IOException` is a missing connection, a code a server answer. */
    var dayFailure: (() -> Response<MyDay>)? = null

    /** Every `GET /v1/me/day` received: the date asked for and the surface. */
    val dayRequests = mutableListOf<Pair<String, MeApi.SurfaceGetMyDay?>>()

    /** `GET /v1/me/day` waits for this before it answers, so a test can act while the read is under way. */
    var dayGate: kotlinx.coroutines.CompletableDeferred<Unit>? = null

    override suspend fun getMyDay(date: String, surface: MeApi.SurfaceGetMyDay?): Response<MyDay> {
        dayRequests += date to surface
        dayGate?.await()
        dayFailure?.let { return it() }
        return Response.success(
            day ?: MyDay(
                date = date,
                timeZone = "Europe/Amsterdam",
                workspaceCount = 1,
                workspaces = emptyList(),
                showsKindLabel = false,
                items = emptyList(),
                summary = MyDaySummary(0, 0),
                hasSessions = true,
            ),
        )
    }

    /** The next `GET /v1/me/day` finds no connection. */
    fun failDayOffline() {
        dayFailure = { throw java.io.IOException("offline") }
    }

    /** The next `GET /v1/me/day` is answered with [code]. */
    fun failDayWith(code: Int) {
        dayFailure = { Response.error(code, "{}".toResponseBody()) }
    }

    /** Reads work again. */
    fun recoverDay() {
        dayFailure = null
    }

    /**
     * What `GET /v1/me/sessions` holds (F013 Agenda): the answer is these sessions cut to the days asked for, as the API cuts
     * them (by the day in Dutch time), in time order. Without any, the call answers `404`: a test that needs the week says so.
     */
    var sessions: List<PersonalSession>? = null

    /** The workspaces `GET /v1/me/sessions` says the view spans. */
    var sessionsWorkspaceCount = 2

    /** What the sessions answer says of the kind label (#1534): the API decides it, not the items. */
    var sessionsShowKindLabel = true

    /** `GET /v1/me/sessions` fails with this instead: an `IOException` is a missing connection, a code a server answer. */
    var sessionsFailure: (() -> Response<MySessions>)? = null

    /** Every `GET /v1/me/sessions` received: the first day, the last day and the surface. */
    val sessionRequests = mutableListOf<Triple<String, String, MeApi.SurfaceListMySessions?>>()

    /** `GET /v1/me/sessions` waits for this before it answers, so a test can act while the read is under way. */
    var sessionsGate: CompletableDeferred<Unit>? = null

    override suspend fun listMySessions(
        from: String,
        to: String,
        surface: MeApi.SurfaceListMySessions?,
    ): Response<MySessions> {
        sessionRequests += Triple(from, to, surface)
        sessionsGate?.await()
        sessionsFailure?.let { return it() }
        val held = sessions ?: return Response.error(404, "{}".toResponseBody())
        val amsterdam = java.time.ZoneId.of("Europe/Amsterdam")
        val first = java.time.LocalDate.parse(from)
        val last = java.time.LocalDate.parse(to)
        val inRange = held.filter {
            val day = it.startsAt.atZoneSameInstant(amsterdam).toLocalDate()
            !day.isBefore(first) && !day.isAfter(last)
        }
        return Response.success(
            MySessions(
                from = from,
                to = to,
                timeZone = "Europe/Amsterdam",
                workspaceCount = sessionsWorkspaceCount,
                workspaces = emptyList(),
                showsKindLabel = sessionsShowKindLabel,
                items = inRange.sortedBy { it.startsAt },
            ),
        )
    }

    /** The next `GET /v1/me/sessions` finds no connection. */
    fun failSessionsOffline() {
        sessionsFailure = { throw java.io.IOException("offline") }
    }

    /** The next `GET /v1/me/sessions` is answered with [code]. */
    fun failSessionsWith(code: Int) {
        sessionsFailure = { Response.error(code, "{}".toResponseBody()) }
    }

    /** Reads of sessions work again. */
    fun recoverSessions() {
        sessionsFailure = null
    }

    val workspaceAnswers = ArrayDeque<suspend () -> Response<List<MyWorkspace>>>()
    var workspaceCalls = 0
        private set

    override suspend fun listMyWorkspaces(): Response<List<MyWorkspace>> {
        workspaceCalls++
        val answer = workspaceAnswers.removeFirstOrNull()
            ?: error("FakeMeApi.listMyWorkspaces has no answer: the app asked for call $workspaceCalls")
        return answer()
    }

    /** `GET /v1/me/workspaces` answers with these workspaces: name to slug to role. */
    fun answerWorkspaces(vararg workspaces: Triple<String, String, MyWorkspace.Role>) =
        answerWorkspaces(trainingOwners = emptySet(), *workspaces)

    /**
     * The same, and the Owners of the workspaces named in [trainingOwners] train there (an Owner's switch is on). A
     * workspace named in [capabilities] lists exactly those capabilities, whatever the role; the others list what the
     * permission matrix gives their role. A workspace named in [trainerWords] uses that word for the people who teach
     * (F068); the others use *trainer*.
     */
    fun answerWorkspaces(
        trainingOwners: Set<String>,
        vararg workspaces: Triple<String, String, MyWorkspace.Role>,
        capabilities: Map<String, List<MyWorkspace.Capabilities>> = emptyMap(),
        trainerWords: Map<String, TrainerWord> = emptyMap(),
    ) {
        workspaceAnswers += {
            Response.success(
                workspaces.map { (name, slug, role) ->
                    MyWorkspace(
                        workspaceIdOf(name),
                        name,
                        slug,
                        trainerWords[name] ?: TrainerWord.TRAINER,
                        role,
                        teamMemberIdOf(name),
                        capabilities[name] ?: capabilitiesOf(role),
                        // A Trainer always trains; an Owner here has not switched it on (F005).
                        trainsHere = role == MyWorkspace.Role.TRAINER || name in trainingOwners,
                    )
                },
            )
        }
    }

    /** What the permission matrix gives a role (F004): the Owner everything, the Trainer the clients and the trainers list. */
    private fun capabilitiesOf(role: MyWorkspace.Role): List<MyWorkspace.Capabilities> {
        val all = MyWorkspace.Capabilities.values().toList()
        if (role == MyWorkspace.Role.OWNER) return all
        return all.filter { it.value.startsWith("trainers.") || it.value.startsWith("clients.") }
    }

    /** The account has a workspace by default, so the screens that don't care which state they are in show the home. */
    fun answerAccount(
        email: String = "owner@example.com",
        name: String? = "Owner",
        id: UUID = UUID.randomUUID(),
        workspaces: List<String> = listOf("John's Gym"),
        canCreateWorkspace: Boolean = false,
        preferredLocale: MeResponse.PreferredLocale? = null,
        capabilities: List<MeWorkspace.Capabilities> = MeWorkspace.Capabilities.values().toList(),
        capabilitiesByWorkspace: Map<String, List<MeWorkspace.Capabilities>> = emptyMap(),
        trainerWords: Map<String, TrainerWord> = emptyMap(),
        role: MeWorkspace.Role = MeWorkspace.Role.OWNER,
        teamMemberId: UUID? = null,
    ) {
        answers += {
            Response.success(
                MeResponse(
                    id = id,
                    email = email,
                    name = name,
                    preferredLocale = preferredLocale ?: defaultPreferredLocale,
                    bookingEmails = true,
                    canCreateWorkspace = canCreateWorkspace,
                    workspaces = workspaces.map {
                        MeWorkspace(
                            workspaceIdOf(it),
                            it,
                            "slug",
                            trainerWords[it] ?: TrainerWord.TRAINER,
                            role,
                            teamMemberId ?: teamMemberIdOf(it),
                            capabilitiesByWorkspace[it] ?: capabilities,
                        )
                    },
                    clientWorkspaces = emptyList(),
                ),
            )
        }
    }
}

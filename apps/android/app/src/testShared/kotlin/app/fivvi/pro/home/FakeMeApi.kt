package app.fivvi.pro.home

import app.fivvi.api.apis.MeApi
import app.fivvi.api.models.MeResponse
import app.fivvi.api.models.MeWorkspace
import app.fivvi.api.models.MyWorkspace
import app.fivvi.api.models.UpdateMeRequest
import java.util.UUID
import okhttp3.ResponseBody.Companion.toResponseBody
import retrofit2.Response

/** The ID the fakes give the workspace of this name, so a test can name it without keeping it. */
fun workspaceIdOf(name: String): UUID = UUID.nameUUIDFromBytes(name.toByteArray())

/** The generated client's own API interface, answering each call with the next queued answer. */
class FakeMeApi : MeApi {
    /** The stored language of an account answered without one: the activity tests set the phone's, so it changes nothing. */
    var defaultPreferredLocale = MeResponse.PreferredLocale.NL_NL

    val answers = ArrayDeque<suspend () -> Response<MeResponse>>()
    var calls = 0
        private set
    private var lastAnswer: (suspend () -> Response<MeResponse>)? = null

    /**
     * Answers with the next queued answer. When none is left it repeats the last one, so a screen that reads the account
     * again (Profiel does, on opening and on foreground) needs no answer queued for it unless the test is about that read.
     */
    override suspend fun getMe(): Response<MeResponse> {
        calls++
        val answer = answers.removeFirstOrNull()?.also { lastAnswer = it } ?: lastAnswer
            ?: error("FakeMeApi.getMe has no answer: call answerAccount first")
        return answer()
    }

    /** Every `PATCH /v1/me` body received, in order. */
    val updates = mutableListOf<UpdateMeRequest>()

    /** What `PATCH /v1/me` answers; it fails with this exception when set. */
    var updateFailure: Exception? = null

    override suspend fun updateMe(updateMeRequest: UpdateMeRequest): Response<MeResponse> {
        updates += updateMeRequest
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
                canCreateWorkspace = false,
                workspaces = emptyList(),
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

    val workspaceAnswers = ArrayDeque<suspend () -> Response<List<MyWorkspace>>>()
    var workspaceCalls = 0
        private set

    override suspend fun listMyWorkspaces(): Response<List<MyWorkspace>> {
        workspaceCalls++
        return workspaceAnswers.removeFirst()()
    }

    /** `GET /v1/me/workspaces` answers with these workspaces: name to slug to role. */
    fun answerWorkspaces(vararg workspaces: Triple<String, String, MyWorkspace.Role>) =
        answerWorkspaces(trainingOwners = emptySet(), *workspaces)

    /** The same, and the Owners of the workspaces named in [trainingOwners] train there (an Owner's switch is on). */
    fun answerWorkspaces(trainingOwners: Set<String>, vararg workspaces: Triple<String, String, MyWorkspace.Role>) {
        workspaceAnswers += {
            Response.success(
                workspaces.map { (name, slug, role) ->
                    MyWorkspace(
                        workspaceIdOf(name),
                        name,
                        slug,
                        role,
                        capabilitiesOf(role),
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
    ) {
        answers += {
            Response.success(
                MeResponse(
                    id = id,
                    email = email,
                    name = name,
                    preferredLocale = preferredLocale ?: defaultPreferredLocale,
                    canCreateWorkspace = canCreateWorkspace,
                    workspaces = workspaces.map {
                        MeWorkspace(
                            workspaceIdOf(it),
                            it,
                            "slug",
                            MeWorkspace.Role.OWNER,
                            MeWorkspace.Capabilities.values().toList(),
                        )
                    },
                ),
            )
        }
    }
}

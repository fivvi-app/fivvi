package app.fivvi.core.me

import app.fivvi.api.apis.MeApi
import app.fivvi.api.models.MeResponse
import app.fivvi.api.models.MeWorkspace
import app.fivvi.api.models.MyWorkspace
import app.fivvi.api.models.UpdateMeRequest
import java.util.UUID
import kotlinx.coroutines.CompletableDeferred
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
     * permission matrix gives their role.
     */
    fun answerWorkspaces(
        trainingOwners: Set<String>,
        vararg workspaces: Triple<String, String, MyWorkspace.Role>,
        capabilities: Map<String, List<MyWorkspace.Capabilities>> = emptyMap(),
    ) {
        workspaceAnswers += {
            Response.success(
                workspaces.map { (name, slug, role) ->
                    MyWorkspace(
                        workspaceIdOf(name),
                        name,
                        slug,
                        role,
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
        role: MeWorkspace.Role = MeWorkspace.Role.OWNER,
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
                            role,
                            capabilitiesByWorkspace[it] ?: capabilities,
                        )
                    },
                ),
            )
        }
    }
}

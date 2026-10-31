package app.fivvi.pro.home

import app.fivvi.api.apis.MeApi
import app.fivvi.api.models.MeResponse
import app.fivvi.api.models.MeWorkspace
import app.fivvi.api.models.MyWorkspace
import app.fivvi.api.models.UpdateMeRequest
import java.util.UUID
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
        return answers.removeFirst()()
    }

    /** Every `PATCH /v1/me` body received, in order. */
    val updates = mutableListOf<UpdateMeRequest>()

    /** What `PATCH /v1/me` answers; it fails with this exception when set. */
    var updateFailure: Exception? = null

    override suspend fun updateMe(updateMeRequest: UpdateMeRequest): Response<MeResponse> {
        updates += updateMeRequest
        updateFailure?.let { throw it }
        return Response.success(
            MeResponse(
                id = UUID.randomUUID(),
                email = "owner@example.com",
                name = "Owner",
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

    val workspaceAnswers = ArrayDeque<suspend () -> Response<List<MyWorkspace>>>()
    var workspaceCalls = 0
        private set

    override suspend fun listMyWorkspaces(): Response<List<MyWorkspace>> {
        workspaceCalls++
        return workspaceAnswers.removeFirst()()
    }

    /** `GET /v1/me/workspaces` answers with these workspaces: name to slug to role. */
    fun answerWorkspaces(vararg workspaces: Triple<String, String, MyWorkspace.Role>) {
        workspaceAnswers += {
            Response.success(
                workspaces.map { (name, slug, role) ->
                    MyWorkspace(workspaceIdOf(name), name, slug, role)
                },
            )
        }
    }

    /** The account has a workspace by default, so the screens that don't care which state they are in show the home. */
    fun answerAccount(
        email: String = "owner@example.com",
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
                    name = "Owner",
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

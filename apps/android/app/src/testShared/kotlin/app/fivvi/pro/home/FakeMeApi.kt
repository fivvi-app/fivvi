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
    val answers = ArrayDeque<suspend () -> Response<MeResponse>>()
    var calls = 0
        private set

    override suspend fun getMe(): Response<MeResponse> {
        calls++
        return answers.removeFirst()()
    }

    override suspend fun updateMe(updateMeRequest: UpdateMeRequest): Response<MeResponse> =
        error("FakeMeApi.updateMe is not expected in this test")

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
    ) {
        answers += {
            Response.success(
                MeResponse(
                    id = id,
                    email = email,
                    name = "Owner",
                    preferredLocale = MeResponse.PreferredLocale.NL_NL,
                    canCreateWorkspace = canCreateWorkspace,
                    workspaces = workspaces.map { MeWorkspace(workspaceIdOf(it), it, "slug", MeWorkspace.Role.OWNER) },
                ),
            )
        }
    }
}

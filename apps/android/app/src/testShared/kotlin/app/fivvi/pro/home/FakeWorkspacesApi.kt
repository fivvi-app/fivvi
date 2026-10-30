package app.fivvi.pro.home

import app.fivvi.api.apis.WorkspacesApi
import app.fivvi.api.models.CreateWorkspaceRequest
import app.fivvi.api.models.Locale
import app.fivvi.api.models.UpdateWorkspaceRequest
import app.fivvi.api.models.Workspace
import java.util.UUID
import okhttp3.ResponseBody.Companion.toResponseBody
import retrofit2.Response

/** The generated client's own API interface; only the workspace read is answered, with the next queued answer. */
class FakeWorkspacesApi : WorkspacesApi {
    val answers = ArrayDeque<suspend (UUID) -> Response<Workspace>>()
    val requested = mutableListOf<UUID>()

    override suspend fun getWorkspace(workspaceId: UUID): Response<Workspace> {
        requested += workspaceId
        // Without a queued answer the account is still on the team, as in every test that is not about losing access.
        return if (answers.isEmpty()) found(workspaceId) else answers.removeFirst()(workspaceId)
    }

    private fun found(id: UUID): Response<Workspace> =
        Response.success(Workspace(id, "John's Gym", "johns-gym", Locale.NL_NL, "Europe/Amsterdam"))

    /** The account is still on the team: the workspace is read. */
    fun answerFound() {
        answers += { found(it) }
    }

    /** The account was removed from the team: 404, as for a workspace that does not exist (ADR-006). */
    fun answerGone() {
        answers += { Response.error(404, "{}".toResponseBody()) }
    }

    override suspend fun createWorkspace(createWorkspaceRequest: CreateWorkspaceRequest): Response<Workspace> =
        error("FakeWorkspacesApi.createWorkspace is not expected in this test")

    override suspend fun renameWorkspace(
        workspaceId: UUID,
        updateWorkspaceRequest: UpdateWorkspaceRequest,
    ): Response<Workspace> = error("FakeWorkspacesApi.renameWorkspace is not expected in this test")
}

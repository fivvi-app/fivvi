package app.fivvi.pro.home

import app.fivvi.api.apis.WorkspacesApi
import app.fivvi.api.models.CreateWorkspaceRequest
import app.fivvi.api.models.Locale
import app.fivvi.api.models.TrainerWord
import app.fivvi.api.models.UpdateWorkspaceRequest
import app.fivvi.api.models.Workspace
import app.fivvi.api.models.WorkspaceCalendar
import app.fivvi.api.models.WorkspaceDay
import app.fivvi.api.models.WorkspaceSwitchedRequest
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

    private fun found(id: UUID): Response<Workspace> = Response.success(
        Workspace(id, "John's Gym", "johns-gym", Locale.NL_NL, "Europe/Amsterdam", TrainerWord.TRAINER),
    )

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

    override suspend fun getWorkspaceCalendar(
        workspaceId: UUID,
        from: String,
        to: String,
        trainerIds: List<UUID>?,
        types: List<String>?,
        groupClassId: UUID?,
        includeCancelled: Boolean?,
        surface: WorkspacesApi.SurfaceGetWorkspaceCalendar?,
    ): Response<WorkspaceCalendar> = error("FakeWorkspacesApi.getWorkspaceCalendar is not expected in this test")

    /** The day `GET …/day` answers (F014); without one the call is not expected. */
    var workspaceDay: WorkspaceDay? = null

    /** While set, the day call answers with this status (403, 404), as for a person who may not read it. */
    var dayStatus: Int? = null

    /** While set, the day call fails with this exception (no connection). */
    var dayFailure: Exception? = null

    /** Every day asked for: the workspace and the date (`null`: today in the workspace). */
    val dayRequests = mutableListOf<Pair<UUID, String?>>()

    override suspend fun getWorkspaceDay(workspaceId: UUID, date: String?): Response<WorkspaceDay> {
        dayRequests += workspaceId to date
        dayFailure?.let { throw it }
        dayStatus?.let { return Response.error(it, "{}".toResponseBody()) }
        val day = workspaceDay ?: error("FakeWorkspacesApi.getWorkspaceDay is not expected in this test")
        return Response.success(day)
    }

    override suspend fun recordWorkspaceSwitch(
        workspaceId: UUID,
        workspaceSwitchedRequest: WorkspaceSwitchedRequest?,
    ): Response<Unit> = error("FakeWorkspacesApi.recordWorkspaceSwitch is not expected in this test")
}

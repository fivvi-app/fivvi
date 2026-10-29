package app.fivvi.api.apis

import app.fivvi.api.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

import app.fivvi.api.models.CreateWorkspaceRequest
import app.fivvi.api.models.Forbidden
import app.fivvi.api.models.NotFound
import app.fivvi.api.models.NotSignedIn
import app.fivvi.api.models.RenameWorkspaceRequest
import app.fivvi.api.models.ValidationError
import app.fivvi.api.models.Workspace

interface WorkspacesApi {
    /**
     * POST v1/workspaces
     * Create the caller’s workspace
     * Creates a workspace and makes the caller its Owner, in one transaction: the workspace (Dutch as its default language, &#x60;Europe/Amsterdam&#x60;, a slug made from its name, with a number added when taken), the Owner’s team role and, when given, the account’s name. Only an account on the sign-up allowlist with no team role in any workspace may: anyone else gets &#x60;403&#x60; and nothing is created.
     * Responses:
     *  - 201: The new workspace.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The account may not create a workspace: it is not on the sign-up allowlist, or it already has a team role in a workspace.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param createWorkspaceRequest 
     * @return [Workspace]
     */
    @POST("v1/workspaces")
    suspend fun createWorkspace(@Body createWorkspaceRequest: CreateWorkspaceRequest): Response<Workspace>

    /**
     * GET v1/workspaces/{workspaceId}
     * A workspace
     * The workspace: its name, URL name, default language and time zone.
     * Responses:
     *  - 200: The workspace.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @return [Workspace]
     */
    @GET("v1/workspaces/{workspaceId}")
    suspend fun getWorkspace(@Path("workspaceId") workspaceId: java.util.UUID): Response<Workspace>

    /**
     * PATCH v1/workspaces/{workspaceId}
     * Rename a workspace
     * Changes the name of the workspace (the Owner only). The slug never changes, so links and QR codes keep working. The name is trimmed, not blank and at most 80 characters.
     * Responses:
     *  - 200: The workspace with its new name.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param renameWorkspaceRequest 
     * @return [Workspace]
     */
    @PATCH("v1/workspaces/{workspaceId}")
    suspend fun renameWorkspace(@Path("workspaceId") workspaceId: java.util.UUID, @Body renameWorkspaceRequest: RenameWorkspaceRequest): Response<Workspace>

}

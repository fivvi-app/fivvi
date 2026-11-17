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
import app.fivvi.api.models.UpdateWorkspaceRequest
import app.fivvi.api.models.ValidationError
import app.fivvi.api.models.Workspace
import app.fivvi.api.models.WorkspaceSwitchedRequest

interface WorkspacesApi {
    /**
     * POST v1/workspaces
     * Create the caller’s workspace
     * Creates a workspace and makes the caller its Owner, in one transaction: the workspace (Dutch as its default language, &#x60;Europe/Amsterdam&#x60;, a slug made from its name, with a number added when taken), the Owner’s team role with a trainer profile (the creator trains in the workspace they set up) and, when given, the account’s name. Only an account on the sign-up allowlist may, also when it has a workspace already: anyone else gets &#x60;403&#x60; and nothing is created.
     * Responses:
     *  - 201: The new workspace.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The account may not create a workspace: it is not on the sign-up allowlist.
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
     * The workspace: its name, URL name, default language, time zone and the word it uses for its trainers.
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
     * POST v1/workspaces/{workspaceId}/switched
     * Report that the caller switched to this workspace
     * Records the product event &#x60;workspace_switched&#x60; with the workspace ID and the surface (&#x60;web&#x60;, &#x60;ios&#x60; or &#x60;android&#x60;) and nothing else, so that the use of more than one workspace can be counted without personal data (F012). Nothing about the current workspace is stored: the choice stays on the device. The body is optional; the web sends none and is recorded as &#x60;web&#x60;. A request with a bearer token records the &#x60;surface&#x60; it names in the body and, naming none, records nothing. Any team member of the workspace may call it.
     * Responses:
     *  - 204: Recorded, or nothing to record. The body is empty.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param workspaceSwitchedRequest  (optional)
     * @return [Unit]
     */
    @POST("v1/workspaces/{workspaceId}/switched")
    suspend fun recordWorkspaceSwitch(@Path("workspaceId") workspaceId: java.util.UUID, @Body workspaceSwitchedRequest: WorkspaceSwitchedRequest? = null): Response<Unit>

    /**
     * PATCH v1/workspaces/{workspaceId}
     * Rename a workspace, set its default language or its word for trainers
     * Changes the name, the default communication language and/or the word for trainers of the workspace (the Owner only; a Trainer reads the word but gets &#x60;403&#x60; when changing it). The slug never changes, so links and QR codes keep working. The name is trimmed, not blank and at most 80 characters; the language is &#x60;nl-NL&#x60; or &#x60;en&#x60;; the word is &#x60;trainer&#x60;, &#x60;instructeur&#x60;, &#x60;docent&#x60; or &#x60;coach&#x60;. Anything else answers &#x60;400&#x60; (the API’s validation error) and nothing changes. The role stays Trainer whatever the word.
     * Responses:
     *  - 200: The workspace with its changes.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param updateWorkspaceRequest 
     * @return [Workspace]
     */
    @PATCH("v1/workspaces/{workspaceId}")
    suspend fun renameWorkspace(@Path("workspaceId") workspaceId: java.util.UUID, @Body updateWorkspaceRequest: UpdateWorkspaceRequest): Response<Workspace>

}

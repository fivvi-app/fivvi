package app.fivvi.api.apis

import app.fivvi.api.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

import app.fivvi.api.models.CreateWorkspaceRequest
import app.fivvi.api.models.Forbidden
import app.fivvi.api.models.NotSignedIn
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

}

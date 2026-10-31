package app.fivvi.api.apis

import app.fivvi.api.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

import app.fivvi.api.models.AddClientRequest
import app.fivvi.api.models.Client
import app.fivvi.api.models.ClientExists
import app.fivvi.api.models.ClientList
import app.fivvi.api.models.Forbidden
import app.fivvi.api.models.NotFound
import app.fivvi.api.models.NotSignedIn
import app.fivvi.api.models.ValidationError

interface ClientsApi {
    /**
     * POST v1/workspaces/{workspaceId}/clients
     * Add a client
     * Adds a client to the workspace (the Owner and every Trainer). Only the name is required. Adding a client never sends an email and never creates an account. If an account has the email address, the client is linked to it; the answer is the same either way. A client of the workspace with the same address (in any case) makes the answer &#x60;409&#x60; with that client’s ID, and nothing is added. Two clients without an email address may share a name.
     * Responses:
     *  - 201: The client that was added.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 409: A client of the workspace already has the email address; nothing was added.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param addClientRequest 
     * @return [Client]
     */
    @POST("v1/workspaces/{workspaceId}/clients")
    suspend fun addClient(@Path("workspaceId") workspaceId: java.util.UUID, @Body addClientRequest: AddClientRequest): Response<Client>

    /**
     * GET v1/workspaces/{workspaceId}/clients
     * The clients of a workspace
     * The whole workspace’s clients (the Owner and every Trainer), sorted by name, one page at a time. &#x60;search&#x60; matches part of a name or an email address in the server, ignoring case and accents.
     * Responses:
     *  - 200: One page of clients.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param search Part of a name or an email address. Case and accents are ignored: &#x60;vrie&#x60; finds &#x60;Anna de Vries&#x60;. Blank is no search. (optional)
     * @param pageSize How many clients a page holds, 1 to 100; 50 by default. (optional, default to 50)
     * @param page Which page, counted from 1, in the order of the list; 1 by default. (optional, default to 1)
     * @return [ClientList]
     */
    @GET("v1/workspaces/{workspaceId}/clients")
    suspend fun listClients(@Path("workspaceId") workspaceId: java.util.UUID, @Query("search") search: kotlin.String? = null, @Query("pageSize") pageSize: kotlin.Int? = 50, @Query("page") page: kotlin.Int? = 1): Response<ClientList>

}

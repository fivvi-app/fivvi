package app.fivvi.api.apis

import app.fivvi.api.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

import app.fivvi.api.models.Forbidden
import app.fivvi.api.models.JoinLink
import app.fivvi.api.models.NotFound
import app.fivvi.api.models.NotSignedIn
import app.fivvi.api.models.RenewJoinLinkRequest
import app.fivvi.api.models.ValidationError

interface JoinLinkApi {
    /**
     * GET v1/workspaces/{workspaceId}/join-link
     * The join link of a workspace
     * The workspace’s join link in full and when it was last renewed. The Owner and the Trainers may read it, to send it to a new client; a client of the workspace gets &#x60;403&#x60;, a person with no place in it &#x60;404&#x60;.
     * Responses:
     *  - 200: The join link.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @return [JoinLink]
     */
    @GET("v1/workspaces/{workspaceId}/join-link")
    suspend fun getJoinLink(@Path("workspaceId") workspaceId: java.util.UUID): Response<JoinLink>

    /**
     * POST v1/workspaces/{workspaceId}/join-link/renew
     * Renew the join link of a workspace
     * Replaces the workspace’s join code with a new one (the Owner only; a Trainer gets &#x60;403&#x60;) and stores the time. The old link, and every QR code of it, stops working at once; join requests already sent stay. Records the product event &#x60;join_link_renewed&#x60; with the workspace ID and the surface (&#x60;web&#x60;, &#x60;ios&#x60; or &#x60;android&#x60;) and nothing else. The body is optional; the web sends none and is recorded as &#x60;web&#x60;. A request with a bearer token records the &#x60;surface&#x60; it names in the body and, naming none, records nothing.
     * Responses:
     *  - 200: The new join link.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param renewJoinLinkRequest  (optional)
     * @return [JoinLink]
     */
    @POST("v1/workspaces/{workspaceId}/join-link/renew")
    suspend fun renewJoinLink(@Path("workspaceId") workspaceId: java.util.UUID, @Body renewJoinLinkRequest: RenewJoinLinkRequest? = null): Response<JoinLink>

}

package app.fivvi.api.apis

import app.fivvi.api.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

import app.fivvi.api.models.Forbidden
import app.fivvi.api.models.Location
import app.fivvi.api.models.NotFound
import app.fivvi.api.models.NotSignedIn
import app.fivvi.api.models.UpdateLocationRequest
import app.fivvi.api.models.ValidationError

interface LocationsApi {
    /**
     * GET v1/workspaces/{workspaceId}/locations
     * The locations of a workspace
     * The workspace’s locations, the default first. At go-live that is the one location of the gym, marked &#x60;isDefault&#x60;. Every team member may read it (sessions show it); a client of the workspace gets &#x60;403&#x60;, a person with no place in it &#x60;404&#x60;.
     * Responses:
     *  - 200: The locations.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @return [kotlin.collections.List<Location>]
     */
    @GET("v1/workspaces/{workspaceId}/locations")
    suspend fun listLocations(@Path("workspaceId") workspaceId: java.util.UUID): Response<kotlin.collections.List<Location>>

    /**
     * PATCH v1/workspaces/{workspaceId}/locations/{locationId}
     * Change a location’s name or address
     * Changes the name and/or the address of one location of the workspace (the Owner only; a Trainer gets &#x60;403&#x60;). The name is trimmed, not blank and at most 120 characters. The address is Dutch and all or nothing: a half-filled one, or a postcode that is not Dutch, answers &#x60;400&#x60; and nothing changes; &#x60;\&quot;1234ab\&quot;&#x60; is stored as &#x60;\&quot;1234 AB\&quot;&#x60;; &#x60;null&#x60; removes the address. A location of another workspace answers &#x60;404&#x60;.
     * Responses:
     *  - 200: The location with its changes.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param locationId The location ID.
     * @param updateLocationRequest 
     * @return [Location]
     */
    @PATCH("v1/workspaces/{workspaceId}/locations/{locationId}")
    suspend fun updateLocation(@Path("workspaceId") workspaceId: java.util.UUID, @Path("locationId") locationId: java.util.UUID, @Body updateLocationRequest: UpdateLocationRequest): Response<Location>

}

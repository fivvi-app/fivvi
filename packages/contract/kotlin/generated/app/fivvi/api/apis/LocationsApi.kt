package app.fivvi.api.apis

import app.fivvi.api.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

import app.fivvi.api.models.AddressLookupResult
import app.fivvi.api.models.Forbidden
import app.fivvi.api.models.Location
import app.fivvi.api.models.NotFound
import app.fivvi.api.models.NotSignedIn
import app.fivvi.api.models.RateLimited
import app.fivvi.api.models.Unavailable
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
     * GET v1/workspaces/{workspaceId}/address-lookup
     * The street and city of a postcode and house number
     * Looks up a Dutch address by postcode, house number and optional addition and answers its street and city (the Owner only; a Trainer gets &#x60;403&#x60;). &#x60;404&#x60; when no address has that postcode, number and addition; &#x60;503&#x60; when the address service does not answer within 3 seconds or fails (the person fills the address in by hand); &#x60;422&#x60; for a postcode that is not Dutch, a house number that is not one to five digits or an addition that is too long or holds anything but letters, digits, spaces and hyphens (the service is not called); &#x60;429&#x60; after 60 lookups per workspace in an hour. The service receives the postcode, the house number and the addition only; nothing is logged.
     * Responses:
     *  - 200: The street and the city.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 422: The postcode, house number or addition is not valid. The service is not called.
     *  - 429: More than 60 lookups for this workspace in the last hour.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *  - 503: The address service did not answer in time, or failed.
     *
     * @param workspaceId The workspace ID.
     * @param postcode A Dutch postcode: four digits, an optional space, two letters.
     * @param houseNumber One to five digits.
     * @param addition The house number addition, for example &#x60;A&#x60; or &#x60;2 hoog&#x60;: at most 10 letters, digits, spaces and hyphens. Optional. (optional)
     * @return [AddressLookupResult]
     */
    @GET("v1/workspaces/{workspaceId}/address-lookup")
    suspend fun lookupAddress(@Path("workspaceId") workspaceId: java.util.UUID, @Query("postcode") postcode: kotlin.String, @Query("houseNumber") houseNumber: kotlin.String, @Query("addition") addition: kotlin.String? = null): Response<AddressLookupResult>

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

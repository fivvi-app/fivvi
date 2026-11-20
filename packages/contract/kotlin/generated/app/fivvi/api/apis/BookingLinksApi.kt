package app.fivvi.api.apis

import app.fivvi.api.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

import app.fivvi.api.models.BookingLink
import app.fivvi.api.models.BookingLinks
import app.fivvi.api.models.CreateBookingLinkRequest
import app.fivvi.api.models.DeactivateBookingLinkRequest
import app.fivvi.api.models.Forbidden
import app.fivvi.api.models.NotFound
import app.fivvi.api.models.NotSignedIn
import app.fivvi.api.models.ValidationError

interface BookingLinksApi {
    /**
     * POST v1/workspaces/{workspaceId}/booking-links
     * Get or make a booking link
     * Gets or makes (get-or-create) the link of a scope, target and page language: an active link with the same scope, target and language is returned (&#x60;200&#x60;) instead of a second one; otherwise a new link with a new code is made (&#x60;201&#x60;). The Owner makes any link; a Trainer only the link of a class date with the visitor’s language (any other answers &#x60;403&#x60;). A target that is not in the workspace, a private session, an Open Gym slot or a class that does not exist answers &#x60;404&#x60;; a class date that has started or passed answers &#x60;400&#x60; (&#x60;date_passed&#x60;); a request that names the wrong target for its scope answers &#x60;400&#x60; with the field in &#x60;issues&#x60;. Records the product event &#x60;booking_link_created&#x60; with the workspace ID, the scope kind, the language mode and the surface (&#x60;web&#x60;, &#x60;ios&#x60; or &#x60;android&#x60;) and nothing else, for a new link only; the web is recorded as &#x60;web&#x60;, a request with a bearer token records the &#x60;surface&#x60; it names in the body and, naming none, records nothing.
     * Responses:
     *  - 200: The active link that already existed.
     *  - 201: The new link.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param createBookingLinkRequest 
     * @return [BookingLink]
     */
    @POST("v1/workspaces/{workspaceId}/booking-links")
    suspend fun createBookingLink(@Path("workspaceId") workspaceId: java.util.UUID, @Body createBookingLinkRequest: CreateBookingLinkRequest): Response<BookingLink>

    /**
     * POST v1/workspaces/{workspaceId}/booking-links/{linkId}/deactivate
     * Deactivate a booking link
     * Stops a link for good (the Owner only; a Trainer gets &#x60;403&#x60;): it is listed as deactivated, never comes back, and a new link for the same scope gets a new code. Deactivating a link again changes nothing and answers &#x60;200&#x60; with the first time. A link that is not in the workspace answers &#x60;404&#x60;. Records the product event &#x60;booking_link_deactivated&#x60; (the same properties as &#x60;booking_link_created&#x60;) the first time only. The body is optional; the web sends none and is recorded as &#x60;web&#x60;.
     * Responses:
     *  - 200: The deactivated link.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param linkId The booking link ID.
     * @param deactivateBookingLinkRequest  (optional)
     * @return [BookingLink]
     */
    @POST("v1/workspaces/{workspaceId}/booking-links/{linkId}/deactivate")
    suspend fun deactivateBookingLink(@Path("workspaceId") workspaceId: java.util.UUID, @Path("linkId") linkId: java.util.UUID, @Body deactivateBookingLinkRequest: DeactivateBookingLinkRequest? = null): Response<BookingLink>

    /**
     * GET v1/workspaces/{workspaceId}/booking-links
     * The booking links of a workspace
     * The workspace’s booking links, for any team member. The first list makes the standing links *Alle boekingen* and *Groepslessen* with the visitor’s language, once (a second list, or two at the same time, makes no more; a standing link that was deactivated is made anew). Each has its short URL and the labels of its target: the class name in both stored languages, the class date’s UTC start and the workspace’s time zone. A client of the workspace gets &#x60;403&#x60;, a person with no place in it &#x60;404&#x60;.
     * Responses:
     *  - 200: The links.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @return [BookingLinks]
     */
    @GET("v1/workspaces/{workspaceId}/booking-links")
    suspend fun listBookingLinks(@Path("workspaceId") workspaceId: java.util.UUID): Response<BookingLinks>

}

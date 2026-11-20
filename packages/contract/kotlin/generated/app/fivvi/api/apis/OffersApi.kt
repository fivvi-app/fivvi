package app.fivvi.api.apis

import app.fivvi.api.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

import app.fivvi.api.models.CreateOfferRequest
import app.fivvi.api.models.Forbidden
import app.fivvi.api.models.NotFound
import app.fivvi.api.models.NotSignedIn
import app.fivvi.api.models.Offer
import app.fivvi.api.models.OfferChanged
import app.fivvi.api.models.UpdateOfferRequest
import app.fivvi.api.models.ValidationError

interface OffersApi {
    /**
     * POST v1/workspaces/{workspaceId}/offers
     * Create an offer
     * Creates an offer of one kind (and, for credits, one credit kind) with the fields of its first version, validated by the rules of its kind. The new offer is switched off. An amount outside 1 to 1,000,000 cents or not a whole number, a fifth kind, two credit kinds and a term over 12 months without &#x60;longTermConfirmed&#x60; answer &#x60;422&#x60; and store nothing. The Owner only.
     * Responses:
     *  - 201: The offer that was created, switched off, at version 1.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 422: The body is not valid: a field has the wrong type, is out of bounds, does not belong to the kind, or needs a confirmation. `issues` names each field (`path`) and what is wrong (`code`). Nothing is stored.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param createOfferRequest 
     * @return [Offer]
     */
    @POST("v1/workspaces/{workspaceId}/offers")
    suspend fun createOffer(@Path("workspaceId") workspaceId: java.util.UUID, @Body createOfferRequest: CreateOfferRequest): Response<Offer>

    /**
     * GET v1/workspaces/{workspaceId}/offers/{offerId}
     * One offer of a workspace
     * One offer with its current version. The Owner only. An offer of another workspace answers &#x60;404&#x60;.
     * Responses:
     *  - 200: The offer.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param offerId The offer ID.
     * @return [Offer]
     */
    @GET("v1/workspaces/{workspaceId}/offers/{offerId}")
    suspend fun getOffer(@Path("workspaceId") workspaceId: java.util.UUID, @Path("offerId") offerId: java.util.UUID): Response<Offer>

    /**
     * GET v1/workspaces/{workspaceId}/offers
     * The offers of a workspace
     * Every offer of the workspace by Dutch name, archived ones included (&#x60;status&#x60;), each with its current version, the summary line in the caller’s language and the number of running agreements. The Owner only; a Trainer and a client of the workspace get &#x60;403&#x60;, anyone with no place in it &#x60;404&#x60;.
     * Responses:
     *  - 200: The offers.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @return [kotlin.collections.List<Offer>]
     */
    @GET("v1/workspaces/{workspaceId}/offers")
    suspend fun listOffers(@Path("workspaceId") workspaceId: java.util.UUID): Response<kotlin.collections.List<Offer>>

    /**
     * PATCH v1/workspaces/{workspaceId}/offers/{offerId}
     * Change an offer: a new version
     * Saves the full set of fields as the offer’s next version, from the version the caller read; the versions before it stay as they were, so agreements that run keep their terms. When the offer has a newer version the answer is &#x60;409&#x60; with the offer as it is now and nothing is stored. The kind never changes; a credit offer’s credit kind can. An offer that is switched on must stay valid to be sold: it keeps a price and a VAT rate. The Owner only.
     * Responses:
     *  - 200: The offer with its new version as the current one.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 409: The offer changed since the version in the request; nothing was written.
     *  - 422: The body is not valid: a field has the wrong type, is out of bounds, does not belong to the kind, or needs a confirmation. `issues` names each field (`path`) and what is wrong (`code`). Nothing is stored.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param offerId The offer ID.
     * @param updateOfferRequest 
     * @return [Offer]
     */
    @PATCH("v1/workspaces/{workspaceId}/offers/{offerId}")
    suspend fun updateOffer(@Path("workspaceId") workspaceId: java.util.UUID, @Path("offerId") offerId: java.util.UUID, @Body updateOfferRequest: UpdateOfferRequest): Response<Offer>

}

package app.fivvi.api.apis

import app.fivvi.api.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

import app.fivvi.api.models.BillingDetails
import app.fivvi.api.models.Forbidden
import app.fivvi.api.models.InvoiceDetails
import app.fivvi.api.models.NotFound
import app.fivvi.api.models.NotSignedIn
import app.fivvi.api.models.SaveBillingDetailsRequest
import app.fivvi.api.models.SaveInvoiceDetailsRequest
import app.fivvi.api.models.ValidationError

interface InvoicesApi {
    /**
     * GET v1/workspaces/{workspaceId}/clients/{clientId}/billing-details
     * The billing details of a client
     * The billing details of one client of the workspace (the Owner only; a Trainer or a client gets &#x60;403&#x60;). A client who saved none has &#x60;asCompany: false&#x60;. A client of another workspace, or one that does not exist, answers &#x60;404&#x60;.
     * Responses:
     *  - 200: The client’s billing details.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param clientId The client ID: the client’s record in this workspace.
     * @return [BillingDetails]
     */
    @GET("v1/workspaces/{workspaceId}/clients/{clientId}/billing-details")
    suspend fun getClientBillingDetails(@Path("workspaceId") workspaceId: java.util.UUID, @Path("clientId") clientId: java.util.UUID): Response<BillingDetails>

    /**
     * GET v1/workspaces/{workspaceId}/settings/invoice-details
     * The invoice details of a workspace
     * The seller’s invoice details, the email for invoice questions and the no-VAT switch of the workspace (the Owner only; a Trainer gets &#x60;403&#x60;). A workspace that never saved them answers &#x60;200&#x60; with &#x60;null&#x60; fields, &#x60;noVat: false&#x60; and &#x60;complete: false&#x60;.
     * Responses:
     *  - 200: The invoice details.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @return [InvoiceDetails]
     */
    @GET("v1/workspaces/{workspaceId}/settings/invoice-details")
    suspend fun getInvoiceDetails(@Path("workspaceId") workspaceId: java.util.UUID): Response<InvoiceDetails>

    /**
     * GET v1/workspaces/{workspaceId}/me/billing-details
     * My billing details at a workspace
     * The signed-in client’s own billing details at this workspace. A client of two workspaces has a separate set in each. A person who is not a client of the workspace answers &#x60;404&#x60;, a team member who is not also a client &#x60;403&#x60;.
     * Responses:
     *  - 200: The client’s own billing details.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @return [BillingDetails]
     */
    @GET("v1/workspaces/{workspaceId}/me/billing-details")
    suspend fun getMyBillingDetails(@Path("workspaceId") workspaceId: java.util.UUID): Response<BillingDetails>

    /**
     * PUT v1/workspaces/{workspaceId}/clients/{clientId}/billing-details
     * Save the billing details of a client on their behalf
     * Saves a client’s billing details as typed, replacing what was saved (the Owner only; a Trainer or a client gets &#x60;403&#x60;). The record notes that the team changed it (&#x60;changedBy: team&#x60;). They apply to the client’s next invoices; issued ones never change. A client of another workspace, or one that does not exist, answers &#x60;404&#x60;.
     * Responses:
     *  - 200: The saved billing details.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 422: With the company switch on, a required field is empty or a field has the wrong format: the issues name the field and the code (`required`, `too_long`, `invalid`, `invalid_vat_number`). Nothing was saved.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param clientId The client ID: the client’s record in this workspace.
     * @param saveBillingDetailsRequest 
     * @return [BillingDetails]
     */
    @PUT("v1/workspaces/{workspaceId}/clients/{clientId}/billing-details")
    suspend fun putClientBillingDetails(@Path("workspaceId") workspaceId: java.util.UUID, @Path("clientId") clientId: java.util.UUID, @Body saveBillingDetailsRequest: SaveBillingDetailsRequest): Response<BillingDetails>

    /**
     * PUT v1/workspaces/{workspaceId}/settings/invoice-details
     * Save the invoice details of a workspace
     * Saves the invoice details as typed, replacing what was saved (the Owner only; a Trainer gets &#x60;403&#x60;). The KvK number is eight digits and the VAT number &#x60;NL&#x60; + 9 digits + &#x60;B&#x60; + 2 digits; a field that is empty or does not match answers &#x60;422&#x60; with its name and code (&#x60;required&#x60;, &#x60;too_long&#x60;, &#x60;invalid&#x60;, &#x60;invalid_kvk_number&#x60;, &#x60;invalid_vat_number&#x60;, &#x60;invalid_email&#x60;) and nothing is saved. A body that is not shaped like the request answers &#x60;400&#x60;. The changes apply to invoices issued afterwards; issued ones never change.
     * Responses:
     *  - 200: The saved invoice details.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 422: A field is empty or has the wrong format: the issues name the field and the code. Nothing was saved.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param saveInvoiceDetailsRequest 
     * @return [InvoiceDetails]
     */
    @PUT("v1/workspaces/{workspaceId}/settings/invoice-details")
    suspend fun putInvoiceDetails(@Path("workspaceId") workspaceId: java.util.UUID, @Body saveInvoiceDetailsRequest: SaveInvoiceDetailsRequest): Response<InvoiceDetails>

    /**
     * PUT v1/workspaces/{workspaceId}/me/billing-details
     * Save my billing details at a workspace
     * Saves the signed-in client’s own billing details at this workspace, replacing what was saved. The record notes that the client changed them (&#x60;changedBy: client&#x60;). They apply to the next invoices; issued ones never change.
     * Responses:
     *  - 200: The saved billing details.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 422: With the company switch on, a required field is empty or a field has the wrong format: the issues name the field and the code (`required`, `too_long`, `invalid`, `invalid_vat_number`). Nothing was saved.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param saveBillingDetailsRequest 
     * @return [BillingDetails]
     */
    @PUT("v1/workspaces/{workspaceId}/me/billing-details")
    suspend fun putMyBillingDetails(@Path("workspaceId") workspaceId: java.util.UUID, @Body saveBillingDetailsRequest: SaveBillingDetailsRequest): Response<BillingDetails>

}

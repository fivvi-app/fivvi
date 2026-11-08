package app.fivvi.api.apis

import app.fivvi.api.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

import app.fivvi.api.models.DemoRequest
import app.fivvi.api.models.DemoRequestRateLimited
import app.fivvi.api.models.DemoRequestUnavailable
import app.fivvi.api.models.ValidationError

interface DemoRequestsApi {
    /**
     * POST v1/demo-requests
     * Ask for a demo
     * Sends one email with the answers to Fivvi’s support address. Nothing is stored and nothing about the visitor is logged; no email goes to the visitor. &#x60;400&#x60; names the invalid fields. A request that fills the &#x60;website&#x60; honeypot gets the &#x60;202&#x60; of any other and sends nothing. &#x60;429&#x60; after 5 requests from one network in an hour, or 60 from everyone. &#x60;503&#x60; when the email could not be sent.
     * Responses:
     *  - 202: Accepted. The body is empty.
     *  - 400: The request did not match the contract.
     *  - 429: Too many requests. Try again later.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *  - 503: The email could not be sent.
     *
     * @param demoRequest 
     * @return [Unit]
     */
    @POST("v1/demo-requests")
    suspend fun requestDemo(@Body demoRequest: DemoRequest): Response<Unit>

}

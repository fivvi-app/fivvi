package app.fivvi.api.apis

import app.fivvi.api.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

import app.fivvi.api.models.MeResponse
import app.fivvi.api.models.Unauthorized

interface MeApi {
    /**
     * GET v1/me
     * The signed-in account
     * The account of the sign-in session in the request. The web sends the sign-in session cookie, the apps’ &#x60;Authorization: Bearer &lt;token&gt;&#x60; (the token of &#x60;POST /v1/sign-in/token&#x60;). A request with an &#x60;Authorization&#x60; header is judged by that token alone, never by a cookie.
     * Responses:
     *  - 200: The account.
     *  - 401: No valid sign-in session or bearer token.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @return [MeResponse]
     */
    @GET("v1/me")
    suspend fun getMe(): Response<MeResponse>

}

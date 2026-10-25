package app.fivvi.api.apis

import app.fivvi.api.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

import app.fivvi.api.models.SignInRequest
import app.fivvi.api.models.SignInTokenRequest
import app.fivvi.api.models.SignInTokenResponse
import app.fivvi.api.models.Unauthorized
import app.fivvi.api.models.ValidationError

interface SignInApi {
    /**
     * POST v1/sign-in/token
     * Exchange the emailed code for a bearer token
     * Uses up the verification of the email (the web’s link and code are the same one), creates the account at the first sign-in of an allowed address, and returns a bearer token. It sets no cookie. Every failure gets the same 401.
     * Responses:
     *  - 200: The bearer token.
     *  - 400: The request did not match the contract.
     *  - 401: The code is wrong, used, replaced or expired. Nothing says which.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param signInTokenRequest 
     * @return [SignInTokenResponse]
     */
    @POST("v1/sign-in/token")
    suspend fun exchangeSignInCode(@Body signInTokenRequest: SignInTokenRequest): Response<SignInTokenResponse>

    /**
     * POST v1/sign-in/request
     * Ask for a sign-in email
     * Sends the sign-in email (EM-08, a link and a 6-digit code) to an account or an allowed address. The answer is the same for every address and for a request over the rate limits, so it never says who has an account.
     * Responses:
     *  - 202: Accepted. The body is empty.
     *  - 400: The request did not match the contract.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param signInRequest 
     * @return [Unit]
     */
    @POST("v1/sign-in/request")
    suspend fun requestSignIn(@Body signInRequest: SignInRequest): Response<Unit>

    /**
     * POST v1/sign-out
     * Sign out
     * Ends the sign-in session of the bearer token in the request, and only that one. Other phones and browsers of the account stay signed in.
     * Responses:
     *  - 204: The sign-in session has ended. The body is empty.
     *  - 401: No valid bearer token.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @return [Unit]
     */
    @POST("v1/sign-out")
    suspend fun signOut(): Response<Unit>

}

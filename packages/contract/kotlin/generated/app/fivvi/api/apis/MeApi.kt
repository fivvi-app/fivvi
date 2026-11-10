package app.fivvi.api.apis

import app.fivvi.api.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

import app.fivvi.api.models.ConfirmEmailChange
import app.fivvi.api.models.InvalidCode
import app.fivvi.api.models.MeResponse
import app.fivvi.api.models.MyDay
import app.fivvi.api.models.MySessions
import app.fivvi.api.models.MyWorkspace
import app.fivvi.api.models.NotSignedIn
import app.fivvi.api.models.RequestEmailChange
import app.fivvi.api.models.UpdateMeRequest
import app.fivvi.api.models.ValidationError

interface MeApi {
    /**
     * POST v1/me/email/confirm
     * Confirm the code and change the signed-in account’s email address
     * With the right code the account’s address becomes the one the code was sent to, in every workspace at once, and every open sign-in session stays signed in. The sign-in codes and links sent to the old address stop working. Answers with the account, as &#x60;GET /v1/me&#x60; does. A wrong, used, replaced or expired code, five wrong codes, an address that has an account by now and a network over its limit all answer &#x60;422&#x60; and nothing changes.
     * Responses:
     *  - 200: The account with its new address.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 422: The code was not accepted.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param confirmEmailChange 
     * @return [MeResponse]
     */
    @POST("v1/me/email/confirm")
    suspend fun confirmEmailChange(@Body confirmEmailChange: ConfirmEmailChange): Response<MeResponse>

    /**
     * GET v1/me
     * The signed-in account
     * The account of the sign-in session in the request. The web sends the sign-in session cookie, the apps’ &#x60;Authorization: Bearer &lt;token&gt;&#x60; (the token of &#x60;POST /v1/sign-in/token&#x60;). A request with an &#x60;Authorization&#x60; header is judged by that token alone, never by a cookie. It also tells where the person goes after sign-in: the workspaces they have a team role in, and whether they may set one up (&#x60;canCreateWorkspace&#x60;: on the sign-up allowlist, also when they have a workspace already).
     * Responses:
     *  - 200: The account.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @return [MeResponse]
     */
    @GET("v1/me")
    suspend fun getMe(): Response<MeResponse>


    /**
    * enum for parameter surface
    */
    @Serializable
    enum class SurfaceGetMyDay(val value: kotlin.String) {
        @SerialName(value = "ios") IOS("ios"),
        @SerialName(value = "android") ANDROID("android")
    }

    /**
     * GET v1/me/day
     * My day: the sessions of one day across my workspaces
     * Everything the signed-in account is the current trainer of on one day, in all the workspaces it trains in, in time order: the items, *Straks* / *Nu bezig*, the summary (with the number done), for today the next free gap and the places still ahead, the tomorrow line, the date of the next session when the day is empty and the number of workspaces. Each workspace is read on its own; the answer is merged here. An account that trains in no workspace (an Owner who does not train, a client account) gets an empty answer, not &#x60;403&#x60;. The day is a date in Dutch time; times are UTC instants, to be shown in Dutch time.
     * Responses:
     *  - 200: The day.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param date The day to show: &#x60;YYYY-MM-DD&#x60;, in Dutch time (Europe/Amsterdam). A date that is none (30 February) answers &#x60;400&#x60; on &#x60;date&#x60;.
     * @param surface The app that sends the request: &#x60;ios&#x60; or &#x60;android&#x60;. A request with a bearer token records the product event of the view with this surface; without it nothing is recorded. The web does not send it, and a request without a bearer token ignores it. (optional)
     * @return [MyDay]
     */
    @GET("v1/me/day")
    suspend fun getMyDay(@Query("date") date: kotlin.String, @Query("surface") surface: SurfaceGetMyDay? = null): Response<MyDay>


    /**
    * enum for parameter surface
    */
    @Serializable
    enum class SurfaceListMySessions(val value: kotlin.String) {
        @SerialName(value = "ios") IOS("ios"),
        @SerialName(value = "android") ANDROID("android")
    }

    /**
     * GET v1/me/sessions
     * My sessions: a range of days across my workspaces
     * The sessions the signed-in account is the current trainer of from the start of &#x60;from&#x60; to the end of &#x60;to&#x60; (at most 42 days, days in Dutch time), in all the workspaces it trains in, in time order: for the week and month views. Cancelled sessions stay. An account that trains nowhere gets an empty list, not &#x60;403&#x60;.
     * Responses:
     *  - 200: The sessions.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param from The first day: &#x60;YYYY-MM-DD&#x60;, in Dutch time. A date that is none answers &#x60;400&#x60; on &#x60;from&#x60;.
     * @param to The last day, included: &#x60;YYYY-MM-DD&#x60;, in Dutch time. Before &#x60;from&#x60; answers &#x60;400&#x60; on &#x60;to&#x60; with &#x60;before_from&#x60;; more than 42 days from &#x60;from&#x60; answers &#x60;400&#x60; with &#x60;range_too_long&#x60;.
     * @param surface The app that sends the request: &#x60;ios&#x60; or &#x60;android&#x60;. A request with a bearer token records the product event of the view with this surface; without it nothing is recorded. The web does not send it, and a request without a bearer token ignores it. (optional)
     * @return [MySessions]
     */
    @GET("v1/me/sessions")
    suspend fun listMySessions(@Query("from") from: kotlin.String, @Query("to") to: kotlin.String, @Query("surface") surface: SurfaceListMySessions? = null): Response<MySessions>

    /**
     * GET v1/me/workspaces
     * The workspaces the signed-in account is on the team of
     * The workspaces where the account has a team role (Owner or Trainer), by name, each with that role and whether they train there (&#x60;trainsHere&#x60;): the list *My workspaces* of the profile shows and the apps use. Workspaces the account is only a client of are not listed. Empty when it has no team role.
     * Responses:
     *  - 200: The workspaces.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @return [kotlin.collections.List<MyWorkspace>]
     */
    @GET("v1/me/workspaces")
    suspend fun listMyWorkspaces(): Response<kotlin.collections.List<MyWorkspace>>

    /**
     * POST v1/me/email/change
     * Ask for a code to change the signed-in account’s email address
     * Sends a 6-digit code to the new address (EM-34), in the account’s language. The address does not change until &#x60;POST /v1/me/email/confirm&#x60; accepts the code. The answer is &#x60;202&#x60; for every valid address, one that already has an account, and a request over the rate limits (3 in 15 minutes per account and per address, 20 an hour per network, as for sign-in), so it never says who has an account; only a free address under the limits gets an email. A new request replaces the earlier code. It acts on the signed-in account alone: no route changes anyone else’s address.
     * Responses:
     *  - 202: Accepted. The body is empty.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param requestEmailChange 
     * @return [Unit]
     */
    @POST("v1/me/email/change")
    suspend fun requestEmailChange(@Body requestEmailChange: RequestEmailChange): Response<Unit>

    /**
     * PATCH v1/me
     * Change the signed-in account
     * Stores the language the person chose (&#x60;preferredLocale&#x60;), so every browser and app of the account shows it from its next load, and the name they gave themselves (&#x60;name&#x60;), one per account, shown in every workspace they are on, and whether they get the emails about bookings in their classes (&#x60;bookingEmails&#x60;, on until switched off), also one per account. Answers with the account, as &#x60;GET /v1/me&#x60; does. A language other than &#x60;nl-NL&#x60; or &#x60;en&#x60;, a name that is empty, blank or over 80 characters, or a &#x60;bookingEmails&#x60; that is not a boolean, answers &#x60;400&#x60; and nothing changes.
     * Responses:
     *  - 200: The account with its change.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param updateMeRequest 
     * @return [MeResponse]
     */
    @PATCH("v1/me")
    suspend fun updateMe(@Body updateMeRequest: UpdateMeRequest): Response<MeResponse>

}

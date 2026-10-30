package app.fivvi.api.apis

import app.fivvi.api.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

import app.fivvi.api.models.MeResponse
import app.fivvi.api.models.MyWorkspace
import app.fivvi.api.models.NotSignedIn
import app.fivvi.api.models.UpdateMeRequest
import app.fivvi.api.models.ValidationError

interface MeApi {
    /**
     * GET v1/me
     * The signed-in account
     * The account of the sign-in session in the request. The web sends the sign-in session cookie, the apps’ &#x60;Authorization: Bearer &lt;token&gt;&#x60; (the token of &#x60;POST /v1/sign-in/token&#x60;). A request with an &#x60;Authorization&#x60; header is judged by that token alone, never by a cookie. It also tells where the person goes after sign-in: the workspaces they have a team role in, and whether they may set one up (&#x60;canCreateWorkspace&#x60;).
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
     * GET v1/me/workspaces
     * The workspaces the signed-in account is on the team of
     * The workspaces where the account has a team role (Owner or Trainer), by name, each with that role: the list *My workspaces* of the profile shows and the apps use. Workspaces the account is only a client of are not listed. Empty when it has no team role.
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
     * PATCH v1/me
     * Change the signed-in account
     * Stores the language the person chose (&#x60;preferredLocale&#x60;), so every browser and app of the account shows it from its next load. Answers with the account, as &#x60;GET /v1/me&#x60; does. A value other than &#x60;nl-NL&#x60; or &#x60;en&#x60; answers &#x60;400&#x60; and nothing changes.
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

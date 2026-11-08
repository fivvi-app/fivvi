package app.fivvi.api.apis

import app.fivvi.api.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

import app.fivvi.api.models.Forbidden
import app.fivvi.api.models.InvitationPreview
import app.fivvi.api.models.MyWorkspace
import app.fivvi.api.models.NotFound
import app.fivvi.api.models.NotSignedIn
import app.fivvi.api.models.ValidationError

interface InvitationsApi {
    /**
     * POST v1/invitations/{token}/accept
     * Accept an invitation
     * The signed-in account whose verified address is the invitation’s joins the workspace as a Trainer, with a trainer profile: on the account it has, a client’s included, which stays as it is. The account’s name becomes the invitation’s name only when it has none. The invitation is used. Someone who is on the team already just gets the workspace back, with the role they have. Two accepts at once make one team-member record: the second answers &#x60;404&#x60;, as for any used invitation. An invitation that is no longer valid answers the neutral &#x60;404&#x60;; an account with another address &#x60;403&#x60;.
     * Responses:
     *  - 200: The workspace the account is now on the team of, as `listMyWorkspaces` shows it.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The signed-in account’s verified address is not the one the invitation is for; nothing changed. Sign out and sign in with the address `GET /v1/invitations/{token}` shows masked.
     *  - 404: The invitation is no longer valid: expired, withdrawn, already used or unknown. The same answer for all four; nothing changed.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param token The token in the invitation link: the last part of &#x60;/invitations/{token}&#x60;.
     * @return [MyWorkspace]
     */
    @POST("v1/invitations/{token}/accept")
    suspend fun acceptInvitation(@Path("token") token: kotlin.String): Response<MyWorkspace>

    /**
     * POST v1/invitations/{token}/decline
     * Decline an invitation
     * The signed-in account whose verified address is the invitation’s declines it: no role is created, the invitation is closed and leaves the Owner’s list. An invitation that is no longer valid answers the neutral &#x60;404&#x60;; an account with another address &#x60;403&#x60;.
     * Responses:
     *  - 204: The invitation was declined.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The signed-in account’s verified address is not the one the invitation is for; nothing changed. Sign out and sign in with the address `GET /v1/invitations/{token}` shows masked.
     *  - 404: The invitation is no longer valid: expired, withdrawn, already used or unknown. The same answer for all four; nothing changed.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param token The token in the invitation link: the last part of &#x60;/invitations/{token}&#x60;.
     * @return [Unit]
     */
    @POST("v1/invitations/{token}/decline")
    suspend fun declineInvitation(@Path("token") token: kotlin.String): Response<Unit>

    /**
     * GET v1/invitations/{token}
     * What an invitation link is for
     * Anyone with the link (signed in or not) reads the name of the workspace that invites, the name of the inviter and the masked address the invitation is for, and nothing else. An invitation that is expired, withdrawn, used or unknown answers one neutral &#x60;404&#x60;.
     * Responses:
     *  - 200: A valid invitation.
     *  - 400: The request did not match the contract.
     *  - 404: The invitation is no longer valid: expired, withdrawn, already used or unknown. The same answer for all four; nothing changed.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param token The token in the invitation link: the last part of &#x60;/invitations/{token}&#x60;.
     * @return [InvitationPreview]
     */
    @GET("v1/invitations/{token}")
    suspend fun getInvitation(@Path("token") token: kotlin.String): Response<InvitationPreview>

}

package app.fivvi.api.apis

import app.fivvi.api.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

import app.fivvi.api.models.ChangeTeamMemberRole
import app.fivvi.api.models.CreateTrainerInvitationRequest
import app.fivvi.api.models.Forbidden
import app.fivvi.api.models.LastOwner
import app.fivvi.api.models.NotFound
import app.fivvi.api.models.NotSignedIn
import app.fivvi.api.models.RemoveTeamMemberRefusal
import app.fivvi.api.models.RemoveTeamMemberRequest
import app.fivvi.api.models.TeamMember
import app.fivvi.api.models.TeamMemberFutureSessions
import app.fivvi.api.models.TeamMemberHandover
import app.fivvi.api.models.TooManyInvitations
import app.fivvi.api.models.TrainerInvitation
import app.fivvi.api.models.TrainerInvitationConflict
import app.fivvi.api.models.ValidationError

interface TeamApi {
    /**
     * PATCH v1/workspaces/{workspaceId}/team-members/{teamMemberId}
     * Change a team member’s role
     * Makes a team member of the workspace an Owner or a Trainer (the Owner only). The role is replaced on the same team-member record, so a person never has two roles in a workspace. It takes effect on the person’s next request. A new Trainer gets a trainer profile (a Trainer always trains); a new Owner keeps the one they had. A workspace keeps at least one Owner: making the last Owner a Trainer answers &#x60;409&#x60; and changes nothing. A role other than &#x60;owner&#x60; or &#x60;trainer&#x60; (&#x60;admin&#x60; included) answers &#x60;400&#x60;.
     * Responses:
     *  - 200: The team member with the new role.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 409: The team member is the last Owner of the workspace; nothing changed.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param teamMemberId The team-member ID, from the team list.
     * @param changeTeamMemberRole 
     * @return [TeamMember]
     */
    @PATCH("v1/workspaces/{workspaceId}/team-members/{teamMemberId}")
    suspend fun changeTeamMemberRole(@Path("workspaceId") workspaceId: java.util.UUID, @Path("teamMemberId") teamMemberId: java.util.UUID, @Body changeTeamMemberRole: ChangeTeamMemberRole): Response<TeamMember>

    /**
     * POST v1/workspaces/{workspaceId}/trainer-invitations
     * Invite a trainer
     * Invites a person to join the team as a Trainer (the Owner only) and emails them the invitation (EM-09) in the chosen language, else the language of the account with that address, else the workspace’s default. The invitation works for seven days. An address that is on the team answers &#x60;409&#x60; &#x60;already_on_team&#x60;; one with a pending invitation &#x60;409&#x60; &#x60;invitation_pending&#x60; with that invitation’s ID, and no second one is made. A workspace makes at most 20 invitations in 24 hours: the next answers &#x60;429&#x60;. If the email can not be sent the answer is &#x60;500&#x60; and nothing is stored.
     * Responses:
     *  - 201: The invitation was made and emailed.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 409: The address is on the team or has a pending invitation; nothing was sent.
     *  - 429: The workspace reached its 20 invitations of the day; nothing was sent.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param createTrainerInvitationRequest 
     * @return [TrainerInvitation]
     */
    @POST("v1/workspaces/{workspaceId}/trainer-invitations")
    suspend fun createTrainerInvitation(@Path("workspaceId") workspaceId: java.util.UUID, @Body createTrainerInvitationRequest: CreateTrainerInvitationRequest): Response<TrainerInvitation>

    /**
     * GET v1/workspaces/{workspaceId}/team-members/{teamMemberId}/future-sessions
     * What a team member still has coming
     * For the removal dialog (the Owner only): the scheduled private sessions and class dates of the team member that have not started, in this workspace only, counted for the next 2 weeks (within 14 days from now, on the workspace’s wall clock) and for later, and whether they are the regular trainer of a series. A cancelled session does not count. A team member who does not train has none. A team member that is not in the workspace answers &#x60;404&#x60;.
     * Responses:
     *  - 200: The counts, possibly all zero.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param teamMemberId The team-member ID, from the team list.
     * @return [TeamMemberFutureSessions]
     */
    @GET("v1/workspaces/{workspaceId}/team-members/{teamMemberId}/future-sessions")
    suspend fun getTeamMemberFutureSessions(@Path("workspaceId") workspaceId: java.util.UUID, @Path("teamMemberId") teamMemberId: java.util.UUID): Response<TeamMemberFutureSessions>

    /**
     * GET v1/workspaces/{workspaceId}/team-members
     * The team of a workspace
     * The people on the team of the workspace (the Owner only), sorted by name: team-member ID, name, email address and role. Clients of the workspace are not on the team.
     * Responses:
     *  - 200: The team.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @return [kotlin.collections.List<TeamMember>]
     */
    @GET("v1/workspaces/{workspaceId}/team-members")
    suspend fun listTeamMembers(@Path("workspaceId") workspaceId: java.util.UUID): Response<kotlin.collections.List<TeamMember>>

    /**
     * GET v1/workspaces/{workspaceId}/trainer-invitations
     * The pending invitations of a workspace
     * The invitations that are still pending (the Owner only), the latest sent first. One whose &#x60;expiresAt&#x60; has passed is still listed, so the Owner can send it again. Accepted, declined and withdrawn invitations are not listed.
     * Responses:
     *  - 200: The pending invitations.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @return [kotlin.collections.List<TrainerInvitation>]
     */
    @GET("v1/workspaces/{workspaceId}/trainer-invitations")
    suspend fun listTrainerInvitations(@Path("workspaceId") workspaceId: java.util.UUID): Response<kotlin.collections.List<TrainerInvitation>>

    /**
     * DELETE v1/workspaces/{workspaceId}/team-members/{teamMemberId}
     * Remove a team member, handing over their future sessions
     * Removes a person from the team of the workspace (the Owner only). Only the team access goes: the person’s account and sign-in sessions stay, and so does anything they have as a client of the workspace. It takes effect on the person’s next request. Their past sessions still show their name. A workspace keeps at least one Owner: removing the last one answers &#x60;409&#x60; &#x60;last_owner&#x60; and changes nothing. A person with future private sessions, class dates or a series they are the regular trainer of needs a handover (the request body): without one the answer is &#x60;409&#x60; &#x60;has_future_sessions&#x60; with the counts and nothing changes. With it, in one transaction: the next 2 weeks’ private sessions go to &#x60;privateTo&#x60; or are cancelled (F026) when it is &#x60;null&#x60;, the next 2 weeks’ class dates go to &#x60;classesTo&#x60; or get *Trainer nodig*, every later session gets *Trainer nodig* (none is cancelled), the series they were the regular trainer of has none, and the person is removed; the answer is &#x60;200&#x60; with what changed. The emails go out after the commit when &#x60;notifyClients&#x60; is not &#x60;false&#x60;. A handover to a team member who does not train in the workspace answers &#x60;422&#x60;. A request without a body for a person with nothing coming answers &#x60;204&#x60;.
     * Responses:
     *  - 200: The team member was removed after the handover in the request.
     *  - 204: The team member was removed; there was nothing to hand over.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 409: The team member is the last Owner of the workspace, or has future sessions and the request holds no handover; nothing changed.
     *  - 422: The handover names a team member who does not train in the workspace; nothing changed.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param teamMemberId The team-member ID, from the team list.
     * @param removeTeamMemberRequest  (optional)
     * @return [TeamMemberHandover]
     */
    @DELETE("v1/workspaces/{workspaceId}/team-members/{teamMemberId}")
    suspend fun removeTeamMember(@Path("workspaceId") workspaceId: java.util.UUID, @Path("teamMemberId") teamMemberId: java.util.UUID, @Body removeTeamMemberRequest: RemoveTeamMemberRequest? = null): Response<TeamMemberHandover>

    /**
     * POST v1/workspaces/{workspaceId}/trainer-invitations/{invitationId}/resend
     * Send an invitation again
     * Emails a pending invitation again (the Owner only) with a new link and a new seven-day expiry; the old link stops working. An invitation that is not pending, or not found in the workspace, answers &#x60;404&#x60;. If the email can not be sent the answer is &#x60;500&#x60; and the old link keeps working.
     * Responses:
     *  - 200: The invitation with its new sending time and expiry.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param invitationId The invitation ID, from the list of pending invitations.
     * @return [TrainerInvitation]
     */
    @POST("v1/workspaces/{workspaceId}/trainer-invitations/{invitationId}/resend")
    suspend fun resendTrainerInvitation(@Path("workspaceId") workspaceId: java.util.UUID, @Path("invitationId") invitationId: java.util.UUID): Response<TrainerInvitation>

    /**
     * DELETE v1/workspaces/{workspaceId}/trainer-invitations/{invitationId}
     * Withdraw an invitation
     * Withdraws a pending invitation (the Owner only): its link stops working and it leaves the list. An invitation that is not pending, or not found in the workspace, answers &#x60;404&#x60;. The address can be invited again.
     * Responses:
     *  - 204: The invitation was withdrawn.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param invitationId The invitation ID, from the list of pending invitations.
     * @return [Unit]
     */
    @DELETE("v1/workspaces/{workspaceId}/trainer-invitations/{invitationId}")
    suspend fun withdrawTrainerInvitation(@Path("workspaceId") workspaceId: java.util.UUID, @Path("invitationId") invitationId: java.util.UUID): Response<Unit>

}

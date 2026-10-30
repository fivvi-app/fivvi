package app.fivvi.api.apis

import app.fivvi.api.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

import app.fivvi.api.models.Forbidden
import app.fivvi.api.models.LastOwner
import app.fivvi.api.models.NotFound
import app.fivvi.api.models.NotSignedIn
import app.fivvi.api.models.TeamMember
import app.fivvi.api.models.ValidationError

interface TeamApi {
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
     * DELETE v1/workspaces/{workspaceId}/team-members/{teamMemberId}
     * Remove a team member
     * Removes a person from the team of the workspace (the Owner only). Only the team access goes: the person’s account and sign-in sessions stay, and so does anything they have as a client of the workspace. It takes effect on the person’s next request. A workspace keeps at least one Owner: removing the last one answers &#x60;409&#x60; and changes nothing.
     * Responses:
     *  - 204: The team member was removed.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 409: The team member is the last Owner of the workspace; nothing changed.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param teamMemberId The team-member ID, from the team list.
     * @return [Unit]
     */
    @DELETE("v1/workspaces/{workspaceId}/team-members/{teamMemberId}")
    suspend fun removeTeamMember(@Path("workspaceId") workspaceId: java.util.UUID, @Path("teamMemberId") teamMemberId: java.util.UUID): Response<Unit>

}

package app.fivvi.api.apis

import app.fivvi.api.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

import app.fivvi.api.models.Forbidden
import app.fivvi.api.models.NotFound
import app.fivvi.api.models.NotSignedIn
import app.fivvi.api.models.Trainer
import app.fivvi.api.models.TrainerProfile
import app.fivvi.api.models.ValidationError

interface TrainersApi {
    /**
     * DELETE v1/workspaces/{workspaceId}/trainer-profile
     * Switch off that the caller trains here
     * Takes the caller’s own trainer profile away: they no longer show in the list of trainers from their next request, and nothing else about them changes. The Owner only; a Trainer always has one and gets &#x60;403&#x60;. It acts on the caller alone: there is no way to name another team member. Idempotent: switching off when it is off answers &#x60;204&#x60; too.
     * Responses:
     *  - 204: The caller does not train in the workspace.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @return [Unit]
     */
    @DELETE("v1/workspaces/{workspaceId}/trainer-profile")
    suspend fun deleteTrainerProfile(@Path("workspaceId") workspaceId: java.util.UUID): Response<Unit>

    /**
     * GET v1/workspaces/{workspaceId}/trainers
     * The trainers of a workspace
     * The team members who train in the workspace, by name: every Trainer, and each Owner who also trains. Each has the team-member ID and the name. Both roles may read it; a client of the workspace gets &#x60;403&#x60;, a person with no place in it &#x60;404&#x60;.
     * Responses:
     *  - 200: The trainers.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @return [kotlin.collections.List<Trainer>]
     */
    @GET("v1/workspaces/{workspaceId}/trainers")
    suspend fun listTrainers(@Path("workspaceId") workspaceId: java.util.UUID): Response<kotlin.collections.List<Trainer>>

    /**
     * PUT v1/workspaces/{workspaceId}/trainer-profile
     * Switch on that the caller trains here
     * Gives the caller their own trainer profile in the workspace: they train here and show in the list of trainers from their next request. The Owner only; a Trainer always has one and gets &#x60;403&#x60;. It acts on the caller alone: there is no way to name another team member. Idempotent: switching on twice keeps one trainer profile.
     * Responses:
     *  - 200: The caller trains in the workspace.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @return [TrainerProfile]
     */
    @PUT("v1/workspaces/{workspaceId}/trainer-profile")
    suspend fun putTrainerProfile(@Path("workspaceId") workspaceId: java.util.UUID): Response<TrainerProfile>

}

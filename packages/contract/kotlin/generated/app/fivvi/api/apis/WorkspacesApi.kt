package app.fivvi.api.apis

import app.fivvi.api.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

import app.fivvi.api.models.CreateWorkspaceRequest
import app.fivvi.api.models.Forbidden
import app.fivvi.api.models.NotFound
import app.fivvi.api.models.NotSignedIn
import app.fivvi.api.models.UpdateWorkspaceRequest
import app.fivvi.api.models.ValidationError
import app.fivvi.api.models.Workspace
import app.fivvi.api.models.WorkspaceCalendar
import app.fivvi.api.models.WorkspaceDay
import app.fivvi.api.models.WorkspaceSwitchedRequest

interface WorkspacesApi {
    /**
     * POST v1/workspaces
     * Create the caller’s workspace
     * Creates a workspace and makes the caller its Owner, in one transaction: the workspace (Dutch as its default language, &#x60;Europe/Amsterdam&#x60;, a slug made from its name, with a number added when taken), the Owner’s team role with a trainer profile (the creator trains in the workspace they set up) and, when given, the account’s name. Only an account on the sign-up allowlist may, also when it has a workspace already: anyone else gets &#x60;403&#x60; and nothing is created.
     * Responses:
     *  - 201: The new workspace.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The account may not create a workspace: it is not on the sign-up allowlist.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param createWorkspaceRequest 
     * @return [Workspace]
     */
    @POST("v1/workspaces")
    suspend fun createWorkspace(@Body createWorkspaceRequest: CreateWorkspaceRequest): Response<Workspace>

    /**
     * GET v1/workspaces/{workspaceId}
     * A workspace
     * The workspace: its name, URL name, default language, time zone and the word it uses for its trainers.
     * Responses:
     *  - 200: The workspace.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @return [Workspace]
     */
    @GET("v1/workspaces/{workspaceId}")
    suspend fun getWorkspace(@Path("workspaceId") workspaceId: java.util.UUID): Response<Workspace>


    /**
    * enum for parameter types
    */
    @Serializable
    enum class TypesGetWorkspaceCalendar(val value: kotlin.String) {
        @SerialName(value = "private") PRIVATE("private"),
        @SerialName(value = "group") GROUP("group")
    }


    /**
    * enum for parameter surface
    */
    @Serializable
    enum class SurfaceGetWorkspaceCalendar(val value: kotlin.String) {
        @SerialName(value = "ios") IOS("ios"),
        @SerialName(value = "android") ANDROID("android")
    }

    /**
     * GET v1/workspaces/{workspaceId}/calendar
     * The workspace calendar: the sessions of a range of days
     * Every session of the workspace that starts from the start of &#x60;from&#x60; to the end of &#x60;to&#x60; (at most 42 days, on the workspace&#39;s wall clock), whoever its trainer is, in time order: private sessions and class dates with their type, status, start and end (UTC instants plus the time zone), trainer, location, the client’s display name, the class name in the viewer’s language, booked and capacity, the series line and what changed on the date. For the Agenda’s week, day per trainer and list. &#x60;trainerIds&#x60;, &#x60;types&#x60;, &#x60;groupClassId&#x60; and &#x60;includeCancelled&#x60; narrow it. Notes are never in it. Every team member may read.
     * Responses:
     *  - 200: The sessions.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param from The first day: &#x60;YYYY-MM-DD&#x60;, on the workspace’s wall clock. A date that is none (30 February) answers &#x60;400&#x60; on &#x60;from&#x60;.
     * @param to The last day, included: &#x60;YYYY-MM-DD&#x60;. Before &#x60;from&#x60; answers &#x60;400&#x60; on &#x60;to&#x60; with &#x60;before_from&#x60;; more than 42 days from &#x60;from&#x60; answers &#x60;400&#x60; with &#x60;range_too_long&#x60;. Left out, the read has no last day, and only with &#x60;groupClassId&#x60; (the upcoming dates of one class, however far ahead; F037): without &#x60;groupClassId&#x60; it answers &#x60;400&#x60; on &#x60;to&#x60; with &#x60;required&#x60;. (optional)
     * @param trainerIds Only the sessions of these trainers (team-member IDs, as in &#x60;GET …/trainers&#x60;); repeat the parameter for each. A session without a trainer matches none. Left out: every trainer. (optional)
     * @param types Only these kinds of session: &#x60;private&#x60; (*Privé*) and &#x60;group&#x60; (*Groep*); repeat the parameter for each. Left out: every kind. (optional)
     * @param groupClassId Only the dates of this class (a class ID, as in &#x60;GET …/group-classes&#x60;): the class dates of one class, no private session. A class of another workspace matches nothing. Left out: every session. For *Eén les op een datum* (F037). (optional)
     * @param includeCancelled *Geannuleerde tonen*: &#x60;true&#x60; (the default) keeps the cancelled sessions, &#x60;false&#x60; leaves them out. (optional)
     * @param surface The app that sends the request: &#x60;ios&#x60; or &#x60;android&#x60;. A request with a bearer token records the product event of the view with this surface; without it nothing is recorded. The web does not send it, and a request without a bearer token ignores it. (optional)
     * @return [WorkspaceCalendar]
     */
    @GET("v1/workspaces/{workspaceId}/calendar")
    suspend fun getWorkspaceCalendar(@Path("workspaceId") workspaceId: java.util.UUID, @Query("from") from: kotlin.String, @Query("to") to: kotlin.String? = null, @Query("trainerIds") trainerIds: @JvmSuppressWildcards kotlin.collections.List<java.util.UUID>? = null, @Query("types") types: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("groupClassId") groupClassId: java.util.UUID? = null, @Query("includeCancelled") includeCancelled: kotlin.Boolean? = null, @Query("surface") surface: SurfaceGetWorkspaceCalendar? = null): Response<WorkspaceCalendar>

    /**
     * GET v1/workspaces/{workspaceId}/day
     * The workspace today: the rows of one day and what needs attention
     * The sessions of the workspace on one day (today unless &#x60;date&#x60; says otherwise, on the workspace’s wall clock), whoever the trainer is, in time order, and *Aandacht nodig*: the class dates and private sessions in the next 14 days that have no trainer. &#x60;busiest&#x60; is the day’s busiest moment (the time with the most sessions at once, and how many), left out when no two sessions overlap. For the Owner’s dashboard and the apps’ *Mijn dag | {workspace}* toggle. Only for the Owner (&#x60;calendar.manage&#x60;).
     * Responses:
     *  - 200: The day.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param date The day to show: &#x60;YYYY-MM-DD&#x60;, on the workspace’s wall clock; today when left out. A date that is none (30 February) answers &#x60;400&#x60; on &#x60;date&#x60;. (optional)
     * @return [WorkspaceDay]
     */
    @GET("v1/workspaces/{workspaceId}/day")
    suspend fun getWorkspaceDay(@Path("workspaceId") workspaceId: java.util.UUID, @Query("date") date: kotlin.String? = null): Response<WorkspaceDay>

    /**
     * POST v1/workspaces/{workspaceId}/switched
     * Report that the caller switched to this workspace
     * Records the product event &#x60;workspace_switched&#x60; with the workspace ID and the surface (&#x60;web&#x60;, &#x60;ios&#x60; or &#x60;android&#x60;) and nothing else, so that the use of more than one workspace can be counted without personal data (F012). Nothing about the current workspace is stored: the choice stays on the device. The body is optional; the web sends none and is recorded as &#x60;web&#x60;. A request with a bearer token records the &#x60;surface&#x60; it names in the body and, naming none, records nothing. Any team member of the workspace may call it.
     * Responses:
     *  - 204: Recorded, or nothing to record. The body is empty.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param workspaceSwitchedRequest  (optional)
     * @return [Unit]
     */
    @POST("v1/workspaces/{workspaceId}/switched")
    suspend fun recordWorkspaceSwitch(@Path("workspaceId") workspaceId: java.util.UUID, @Body workspaceSwitchedRequest: WorkspaceSwitchedRequest? = null): Response<Unit>

    /**
     * PATCH v1/workspaces/{workspaceId}
     * Rename a workspace, set its default language or its word for trainers
     * Changes the name, the default communication language and/or the word for trainers of the workspace (the Owner only; a Trainer reads the word but gets &#x60;403&#x60; when changing it). The slug never changes, so links and QR codes keep working. The name is trimmed, not blank and at most 80 characters; the language is &#x60;nl-NL&#x60; or &#x60;en&#x60;; the word is &#x60;trainer&#x60;, &#x60;instructeur&#x60;, &#x60;docent&#x60; or &#x60;coach&#x60;. Anything else answers &#x60;400&#x60; (the API’s validation error) and nothing changes. The role stays Trainer whatever the word.
     * Responses:
     *  - 200: The workspace with its changes.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param updateWorkspaceRequest 
     * @return [Workspace]
     */
    @PATCH("v1/workspaces/{workspaceId}")
    suspend fun renameWorkspace(@Path("workspaceId") workspaceId: java.util.UUID, @Body updateWorkspaceRequest: UpdateWorkspaceRequest): Response<Workspace>

}

package app.fivvi.api.apis

import app.fivvi.api.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

import app.fivvi.api.models.AssignTrainerRefusal
import app.fivvi.api.models.AssignTrainerRequest
import app.fivvi.api.models.Attendance
import app.fivvi.api.models.AttendanceRefusal
import app.fivvi.api.models.AttendanceTooEarly
import app.fivvi.api.models.Forbidden
import app.fivvi.api.models.MarkEveryoneAttendedRequest
import app.fivvi.api.models.NotFound
import app.fivvi.api.models.NotSignedIn
import app.fivvi.api.models.PlanPrivateSessionRequest
import app.fivvi.api.models.PlannedPrivateSession
import app.fivvi.api.models.ReschedulePrivateSessionRefusal
import app.fivvi.api.models.ReschedulePrivateSessionRequest
import app.fivvi.api.models.ReschedulePrivateSessionResult
import app.fivvi.api.models.Session
import app.fivvi.api.models.SetAttendanceRequest
import app.fivvi.api.models.TrainerAssigned
import app.fivvi.api.models.TrainerCandidates
import app.fivvi.api.models.TrainerConflict
import app.fivvi.api.models.UpcomingSessions
import app.fivvi.api.models.ValidationError

interface SessionsApi {
    /**
     * POST v1/workspaces/{workspaceId}/sessions/{sessionId}/trainer
     * Assign or change the trainer of a session
     * Gives a private session or a class date another trainer, or a class date without one its first (the Owner only: a Trainer gets &#x60;403&#x60;). For a class date &#x60;scope&#x60; is &#x60;this&#x60; (a date without a trainer; the date is marked as changed from its series) or &#x60;following&#x60; (the series’ regular trainer from this date on: dates with a change of their own keep it, earlier dates keep theirs, later dates the calendar fills get the new trainer); for a private session it is ignored. &#x60;version&#x60; is the one the person saw: if the session has been changed since, nothing is stored and the answer is &#x60;409&#x60; (&#x60;session_changed&#x60;) with the session as it is now. A cancelled session answers &#x60;409&#x60; &#x60;session_cancelled&#x60;. The new trainer is checked for double booking (&#x60;409&#x60; &#x60;trainer_conflict&#x60; with the sessions, unless &#x60;allowConflicts&#x60; is &#x60;true&#x60;, PS-07). After the change is committed the clients with a booked place get EM-13, one email each listing their dates, unless &#x60;notifyClients&#x60; is &#x60;false&#x60; or the session has started. No other participant and no email address of the trainer is in it. A session or trainer that is not in the workspace answers &#x60;404&#x60;.
     * Responses:
     *  - 200: The trainer was assigned.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 409: The session was changed after the `version` sent, or it is cancelled, or the new trainer already has something at that time. Nothing was stored.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param sessionId The session ID.
     * @param assignTrainerRequest 
     * @return [TrainerAssigned]
     */
    @POST("v1/workspaces/{workspaceId}/sessions/{sessionId}/trainer")
    suspend fun assignTrainer(@Path("workspaceId") workspaceId: java.util.UUID, @Path("sessionId") sessionId: java.util.UUID, @Body assignTrainerRequest: AssignTrainerRequest): Response<TrainerAssigned>

    /**
     * POST v1/workspaces/{workspaceId}/sessions/private
     * Plan a private session
     * Plans a private session for a client, or a duo session for two clients (&#x60;secondClientId&#x60;, F066), with a trainer (an Owner for any trainer of the workspace, a Trainer for themself; another trainer answers &#x60;403&#x60;) at the workspace’s default location. The date and start are wall-clock time in the workspace’s time zone; the session is stored and answered as UTC instants plus that zone. A past session is saved (&#x60;past&#x60;). A client or trainer that is not in the workspace (or a trainer who does not train) answers &#x60;404&#x60;; an invalid duration, date or time, or a start the clocks skip answers &#x60;400&#x60; with the field in &#x60;issues&#x60;. When &#x60;notify&#x60; is on and the session is not in the past, EM-11 goes to the client after the session is committed, in the client’s email language, else the workspace’s default; for a duo, to each client in their own language, naming the other by first name only. The same client twice answers &#x60;400&#x60; on &#x60;secondClientId&#x60;; a second client that is not in the workspace answers &#x60;404&#x60;. Only a team member plans a duo: no client route plans, books or joins one. When the trainer already has a scheduled session of this workspace that overlaps (back-to-back does not), the answer is &#x60;409&#x60; with the code &#x60;trainer_conflict&#x60; and those sessions, and nothing is stored, unless &#x60;allowConflicts&#x60; is &#x60;true&#x60; (PS-07).
     * Responses:
     *  - 201: The session was planned.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 409: The trainer already has something at that time, and `allowConflicts` was not set. Nothing was stored.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param planPrivateSessionRequest 
     * @return [PlannedPrivateSession]
     */
    @POST("v1/workspaces/{workspaceId}/sessions/private")
    suspend fun createPrivateSession(@Path("workspaceId") workspaceId: java.util.UUID, @Body planPrivateSessionRequest: PlanPrivateSessionRequest): Response<PlannedPrivateSession>

    /**
     * GET v1/workspaces/{workspaceId}/sessions/{sessionId}
     * One session
     * A session of the workspace with its location, trainer and participants, for any team member who may see the workspace’s clients. A session that is not in the workspace answers &#x60;404&#x60;.
     * Responses:
     *  - 200: The session.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param sessionId The session ID.
     * @return [Session]
     */
    @GET("v1/workspaces/{workspaceId}/sessions/{sessionId}")
    suspend fun getSession(@Path("workspaceId") workspaceId: java.util.UUID, @Path("sessionId") sessionId: java.util.UUID): Response<Session>

    /**
     * GET v1/workspaces/{workspaceId}/clients/{clientId}/upcoming-sessions
     * A client’s upcoming sessions
     * The next 5 scheduled private sessions of the client, soonest first (instants in UTC plus the workspace’s time zone, and the trainer), for any team member who may see the workspace’s clients. A session that has started, a cancelled one and one the client’s place in was cancelled are left out. A client who is not in the workspace answers &#x60;404&#x60;.
     * Responses:
     *  - 200: The upcoming sessions, possibly none.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param clientId The client ID.
     * @return [UpcomingSessions]
     */
    @GET("v1/workspaces/{workspaceId}/clients/{clientId}/upcoming-sessions")
    suspend fun listClientUpcomingSessions(@Path("workspaceId") workspaceId: java.util.UUID, @Path("clientId") clientId: java.util.UUID): Response<UpcomingSessions>

    /**
     * GET v1/workspaces/{workspaceId}/sessions/{sessionId}/participants
     * The participants of a session with their attendance
     * The participants of a session (a private session’s client or clients, the seeded or booked participants of a class date) with each one’s ID, display name and status, and the counts of the statuses, for CO-05, CO-06 and the attendance of a private session. It also says when attendance opens and whether the caller may take it. Any team member may read it. A session that is not in the workspace answers &#x60;404&#x60;.
     * Responses:
     *  - 200: The participants.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param sessionId The session ID.
     * @return [Attendance]
     */
    @GET("v1/workspaces/{workspaceId}/sessions/{sessionId}/participants")
    suspend fun listSessionParticipants(@Path("workspaceId") workspaceId: java.util.UUID, @Path("sessionId") sessionId: java.util.UUID): Response<Attendance>

    /**
     * GET v1/workspaces/{workspaceId}/sessions/{sessionId}/trainer-candidates
     * The trainers a session can go to
     * For the trainer dialog (CO-02, *Trainer wijzigen*): the workspace’s trainers except the session’s own, by name, each with what they already have at the session’s time (&#x60;findTrainerConflicts&#x60;, this workspace only, a cancelled session and back-to-back never count) and, for a class date in a series, on how many later dates; and how many clients would be told, for each scope. The Owner only: a Trainer gets &#x60;403&#x60;. A session that is not in the workspace, or an Open Gym, answers &#x60;404&#x60;.
     * Responses:
     *  - 200: The candidates, possibly none.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param sessionId The session ID.
     * @return [TrainerCandidates]
     */
    @GET("v1/workspaces/{workspaceId}/sessions/{sessionId}/trainer-candidates")
    suspend fun listTrainerCandidates(@Path("workspaceId") workspaceId: java.util.UUID, @Path("sessionId") sessionId: java.util.UUID): Response<TrainerCandidates>

    /**
     * POST v1/workspaces/{workspaceId}/sessions/{sessionId}/participants/attended
     * Everyone attended
     * *Iedereen aanwezig*, for a class date only (a private session or any other session answers &#x60;404&#x60;): in one transaction every participant with status &#x60;booked&#x60; becomes &#x60;attended&#x60;, one line of the status history each (the source is the caller’s). A participant who is &#x60;no_show&#x60; or &#x60;cancelled&#x60;, or &#x60;attended&#x60; already, stays as they are. The same rules as one change: the session’s current trainer or the Owner (another Trainer gets &#x60;403&#x60;), from 30 minutes before the start (&#x60;422&#x60; &#x60;attendance_too_early&#x60;), never on a cancelled session (&#x60;409&#x60; &#x60;session_cancelled&#x60;). The same &#x60;clientRequestId&#x60; twice, as a queued request sent again after a reconnect, changes nothing more and answers the current list. Answers the session’s participants with the counts, as &#x60;GET …/participants&#x60; does.
     * Responses:
     *  - 200: Everyone who was open is attended; the participants as they are now.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 409: The session was cancelled. Nothing was stored.
     *  - 422: Attendance opens 30 minutes before the start. Nothing was stored.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param sessionId The session ID.
     * @param markEveryoneAttendedRequest 
     * @return [Attendance]
     */
    @POST("v1/workspaces/{workspaceId}/sessions/{sessionId}/participants/attended")
    suspend fun markEveryoneAttended(@Path("workspaceId") workspaceId: java.util.UUID, @Path("sessionId") sessionId: java.util.UUID, @Body markEveryoneAttendedRequest: MarkEveryoneAttendedRequest): Response<Attendance>

    /**
     * POST v1/workspaces/{workspaceId}/sessions/{sessionId}/reschedule
     * Reschedule a private session
     * Moves a private session to a new local date and start, with a length (the same rules as planning, daylight saving time included); the location stays. The Owner may move any session, a Trainer only their own (&#x60;403&#x60; otherwise). &#x60;version&#x60; is the one the person saw: if the session has been changed since, nothing is stored and the answer is &#x60;409&#x60; with the session as it is now and who changed it last. A cancelled session answers &#x60;409&#x60; too; a session that is not private or not in the workspace answers &#x60;404&#x60;. When the trainer already has a scheduled session of this workspace at the new time (back-to-back does not overlap), the answer is &#x60;409&#x60; with the code &#x60;trainer_conflict&#x60; and those sessions, unless &#x60;allowConflicts&#x60; is &#x60;true&#x60; (PS-07); the version is checked first. When &#x60;notify&#x60; is on and the new time is not in the past, EM-04 goes to the client after the change is committed, in the client’s email language, else the workspace’s default.
     * Responses:
     *  - 200: The session was moved.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 409: The session was changed after the `version` sent, or it is cancelled (`session_changed`, `session_cancelled`), or the trainer already has something at the new time (`trainer_conflict`). Nothing was stored.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param sessionId The session ID.
     * @param reschedulePrivateSessionRequest 
     * @return [ReschedulePrivateSessionResult]
     */
    @POST("v1/workspaces/{workspaceId}/sessions/{sessionId}/reschedule")
    suspend fun reschedulePrivateSession(@Path("workspaceId") workspaceId: java.util.UUID, @Path("sessionId") sessionId: java.util.UUID, @Body reschedulePrivateSessionRequest: ReschedulePrivateSessionRequest): Response<ReschedulePrivateSessionResult>

    /**
     * PUT v1/workspaces/{workspaceId}/sessions/{sessionId}/participants/{clientId}/attendance
     * Set a participant’s attendance
     * Sets a participant to &#x60;attended&#x60;, &#x60;no_show&#x60; or back to &#x60;booked&#x60;, and stores one line of the status history (from, to, the server’s time in UTC, the caller as actor, the source). The session’s current trainer or the Owner may; another Trainer gets &#x60;403&#x60;. From 30 minutes before the start, with no end: before that &#x60;422&#x60; &#x60;attendance_too_early&#x60; with &#x60;opensAt&#x60;. A cancelled session answers &#x60;409&#x60; &#x60;session_cancelled&#x60;, a participant who cancelled their place &#x60;409&#x60; &#x60;participant_cancelled&#x60;. Setting the status the participant has changes nothing. The last write wins; the history keeps both. The same &#x60;clientRequestId&#x60; twice stores one change and answers the current list. Answers the session’s participants as &#x60;GET …/participants&#x60; does. A session or participant that is not in the workspace answers &#x60;404&#x60;.
     * Responses:
     *  - 200: The status is set (or was set already); the participants as they are now.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 409: The session or the participant was cancelled. Nothing was stored.
     *  - 422: Attendance opens 30 minutes before the start. Nothing was stored.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param sessionId The session ID.
     * @param clientId The client ID of the participant.
     * @param setAttendanceRequest 
     * @return [Attendance]
     */
    @PUT("v1/workspaces/{workspaceId}/sessions/{sessionId}/participants/{clientId}/attendance")
    suspend fun setParticipantAttendance(@Path("workspaceId") workspaceId: java.util.UUID, @Path("sessionId") sessionId: java.util.UUID, @Path("clientId") clientId: java.util.UUID, @Body setAttendanceRequest: SetAttendanceRequest): Response<Attendance>

}

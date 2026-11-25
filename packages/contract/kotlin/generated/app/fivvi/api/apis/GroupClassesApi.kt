package app.fivvi.api.apis

import app.fivvi.api.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

import app.fivvi.api.models.CancelClassDateRefusal
import app.fivvi.api.models.CancelClassDateRequest
import app.fivvi.api.models.CancelledClassDate
import app.fivvi.api.models.ClassCancellationPreview
import app.fivvi.api.models.ClassSeries
import app.fivvi.api.models.CreateGroupClassRequest
import app.fivvi.api.models.CreatedGroupClass
import app.fivvi.api.models.Forbidden
import app.fivvi.api.models.GroupClass
import app.fivvi.api.models.KeptClassDates
import app.fivvi.api.models.NotFound
import app.fivvi.api.models.NotSignedIn
import app.fivvi.api.models.ScheduleGroupClassDateRequest
import app.fivvi.api.models.ScheduledClassDate
import app.fivvi.api.models.TrainerConflict
import app.fivvi.api.models.UpdateClassSeriesRefusal
import app.fivvi.api.models.UpdateClassSeriesRequest
import app.fivvi.api.models.UpdateGroupClassDateRefusal
import app.fivvi.api.models.UpdateGroupClassDateRequest
import app.fivvi.api.models.UpdateGroupClassRequest
import app.fivvi.api.models.UpdatedClassDate
import app.fivvi.api.models.UpdatedClassSeries
import app.fivvi.api.models.ValidationError

interface GroupClassesApi {
    /**
     * POST v1/workspaces/{workspaceId}/sessions/{sessionId}/cancel-class
     * Cancel a class date or the rest of its series
     * Cancels a class date (CO-03, the Owner only; a Trainer gets &#x60;403&#x60;): the date becomes &#x60;cancelled&#x60; and stays, each participant’s place becomes &#x60;cancelled&#x60; (one line of the status history each, with the Owner as actor and &#x60;workspace&#x60; as the initiator), and the time (UTC), the Owner and the message are stored. With &#x60;scope: following&#x60; the later dates of the series with participants or changes of their own are cancelled the same way, the later dates with neither are removed, and the series ends the day before this date. EM-05 goes to each participant whose place was cancelled on a date that has not started, after the cancellation is committed, in their email language, else the workspace’s default, with the message as typed, and never names another participant; a date that has started is recorded without an email. A cancelled date answers &#x60;409&#x60; with the code &#x60;session_cancelled&#x60; (a second cancel too, whatever the version; the state is told before the version); a &#x60;version&#x60; that is not the date’s answers &#x60;409&#x60; with &#x60;session_changed&#x60; and the date as it is now. A session that is not a class date of the workspace (a private session too) answers &#x60;404&#x60;. There is no undo.
     * Responses:
     *  - 200: The class date was cancelled.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 409: The date was cancelled already (`session_cancelled`), or changed after the `version` sent (`session_changed`). Nothing was stored.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param sessionId The session ID.
     * @param cancelClassDateRequest 
     * @return [CancelledClassDate]
     */
    @POST("v1/workspaces/{workspaceId}/sessions/{sessionId}/cancel-class")
    suspend fun cancelClassDate(@Path("workspaceId") workspaceId: java.util.UUID, @Path("sessionId") sessionId: java.util.UUID, @Body cancelClassDateRequest: CancelClassDateRequest): Response<CancelledClassDate>

    /**
     * POST v1/workspaces/{workspaceId}/group-classes
     * Create a class
     * Creates a class (the Owner only; a Trainer gets &#x60;403&#x60;). Empty or too long texts, a capacity outside 1 to 100 and a duration outside 15 to 240 minutes in steps of 5 answer &#x60;400&#x60; with the field in &#x60;issues&#x60;. With a &#x60;firstDate&#x60; the class is also put on that date (the apps’ quick create), both in one transaction: a refused date answers &#x60;400&#x60; and leaves no class. A trainer who does not train in the workspace answers &#x60;404&#x60;. When the first date puts the class’s trainer where they already have something (a weekly repeat: on any of its 12 dates), the answer is &#x60;409&#x60; with the code &#x60;trainer_conflict&#x60; and those sessions, and nothing is stored, unless &#x60;allowConflicts&#x60; is &#x60;true&#x60; (PS-07).
     * Responses:
     *  - 201: The class was created.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 409: The trainer already has something at that time, and `allowConflicts` was not set. Nothing was stored.
     *  - 422: The `level` is not one of the four values nor `null`. `issues` names the field. Nothing is stored.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param createGroupClassRequest 
     * @return [CreatedGroupClass]
     */
    @POST("v1/workspaces/{workspaceId}/group-classes")
    suspend fun createGroupClass(@Path("workspaceId") workspaceId: java.util.UUID, @Body createGroupClassRequest: CreateGroupClassRequest): Response<CreatedGroupClass>

    /**
     * GET v1/workspaces/{workspaceId}/group-classes/{classId}
     * One class
     * A class of the workspace, for any team member. A class that is not in the workspace answers &#x60;404&#x60;.
     * Responses:
     *  - 200: The class.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param classId The class ID.
     * @return [GroupClass]
     */
    @GET("v1/workspaces/{workspaceId}/group-classes/{classId}")
    suspend fun getGroupClass(@Path("workspaceId") workspaceId: java.util.UUID, @Path("classId") classId: java.util.UUID): Response<GroupClass>

    /**
     * GET v1/workspaces/{workspaceId}/sessions/{sessionId}/kept-dates
     * How many dates keep their own changes from a date on
     * Before the Owner saves a date with &#x60;scope: following&#x60; (CO-04, *Deze en volgende lessen*), says how many of the series’ dates after this one were changed on their own and would stay as they are: the same count the save answers as &#x60;keptDates&#x60;, read without writing anything (the Owner only; a Trainer gets &#x60;403&#x60;). A session that is not a class date of the workspace (a private session too) answers &#x60;404&#x60;; a class date that is in no series answers &#x60;400&#x60; on &#x60;sessionId&#x60; (&#x60;not_in_series&#x60;).
     * Responses:
     *  - 200: How many dates keep their own changes.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param sessionId The session ID.
     * @return [KeptClassDates]
     */
    @GET("v1/workspaces/{workspaceId}/sessions/{sessionId}/kept-dates")
    suspend fun getKeptClassDates(@Path("workspaceId") workspaceId: java.util.UUID, @Path("sessionId") sessionId: java.util.UUID): Response<KeptClassDates>

    /**
     * GET v1/workspaces/{workspaceId}/group-classes/{classId}/series
     * The weekly series of a class
     * The weekly series of the class that still run (no end, or an end that is today or later), in the order they start (TW-03 *Reeksen*). The Owner only: a Trainer gets &#x60;403&#x60;, and reads the series of a date on the date itself (&#x60;Session.series&#x60;). A class that is not in the workspace answers &#x60;404&#x60;.
     * Responses:
     *  - 200: The series.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param classId The class ID.
     * @return [kotlin.collections.List<ClassSeries>]
     */
    @GET("v1/workspaces/{workspaceId}/group-classes/{classId}/series")
    suspend fun listGroupClassSeries(@Path("workspaceId") workspaceId: java.util.UUID, @Path("classId") classId: java.util.UUID): Response<kotlin.collections.List<ClassSeries>>

    /**
     * GET v1/workspaces/{workspaceId}/group-classes
     * The classes of a workspace
     * The workspace’s classes, sorted by Dutch name. Every team member may read them; a client of the workspace gets &#x60;403&#x60;, a person with no place in it &#x60;404&#x60;.
     * Responses:
     *  - 200: The classes.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @return [kotlin.collections.List<GroupClass>]
     */
    @GET("v1/workspaces/{workspaceId}/group-classes")
    suspend fun listGroupClasses(@Path("workspaceId") workspaceId: java.util.UUID): Response<kotlin.collections.List<GroupClass>>

    /**
     * GET v1/workspaces/{workspaceId}/sessions/{sessionId}/cancel-preview
     * What cancelling a class date would do
     * Before the Owner confirms *Les annuleren* (CO-03), says for each scope how many people get the cancellation email and which dates are cancelled or removed, without storing or sending anything (the Owner only; a Trainer gets &#x60;403&#x60;). &#x60;started&#x60; says the date has started or passed: it is then recorded for the record, with no emails and no message. A cancelled date answers &#x60;409&#x60; with the code &#x60;session_cancelled&#x60;. A session that is not a class date of the workspace (a private session too) answers &#x60;404&#x60;.
     * Responses:
     *  - 200: What cancelling the date reaches.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 409: The date was cancelled already (`session_cancelled`).
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param sessionId The session ID.
     * @return [ClassCancellationPreview]
     */
    @GET("v1/workspaces/{workspaceId}/sessions/{sessionId}/cancel-preview")
    suspend fun previewClassCancellation(@Path("workspaceId") workspaceId: java.util.UUID, @Path("sessionId") sessionId: java.util.UUID): Response<ClassCancellationPreview>

    /**
     * POST v1/workspaces/{workspaceId}/group-classes/{classId}/dates
     * Put a class on a date
     * Schedules the class on a date (the Owner only): a &#x60;group&#x60; session at the local start, taking the class’s trainer, capacity and duration (a trainer or capacity in the request wins for this date; &#x60;trainerId: null&#x60; plans it without a trainer) and the workspace’s default location, stored and answered as UTC instants plus the workspace’s time zone. A start the clocks skip answers &#x60;400&#x60; on &#x60;localStart&#x60; (&#x60;time_does_not_exist&#x60;); one they repeat takes the first. With &#x60;repeat: weekly&#x60; (F022) it also makes the weekly series and its next 12 weeks of dates in the same transaction; the answer is the first date with &#x60;datesAdded&#x60;. A class or trainer that is not in the workspace answers &#x60;404&#x60;. When the date’s trainer already has a scheduled session of this workspace that overlaps (a weekly repeat: on any of its 12 dates), the answer is &#x60;409&#x60; with the code &#x60;trainer_conflict&#x60; and those sessions, and nothing is stored, unless &#x60;allowConflicts&#x60; is &#x60;true&#x60; (PS-07).
     * Responses:
     *  - 201: The class was scheduled; with a weekly repeat, its first date and how many were made.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 409: The trainer already has something at that time, and `allowConflicts` was not set. Nothing was stored.
     *  - 422: The `level` is not one of the four values nor `null`. `issues` names the field. Nothing is stored.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param classId The class ID.
     * @param scheduleGroupClassDateRequest 
     * @return [ScheduledClassDate]
     */
    @POST("v1/workspaces/{workspaceId}/group-classes/{classId}/dates")
    suspend fun scheduleGroupClassDate(@Path("workspaceId") workspaceId: java.util.UUID, @Path("classId") classId: java.util.UUID, @Body scheduleGroupClassDateRequest: ScheduleGroupClassDateRequest): Response<ScheduledClassDate>

    /**
     * PATCH v1/workspaces/{workspaceId}/group-classes/{classId}
     * Change a class
     * Changes the fields given of a class (the Owner only). The same limits as creating apply. Dates already planned keep what they copied. A class or trainer that is not in the workspace answers &#x60;404&#x60;.
     * Responses:
     *  - 200: The class with its changes.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 422: The `level` is not one of the four values nor `null`. `issues` names the field. Nothing is stored.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param classId The class ID.
     * @param updateGroupClassRequest 
     * @return [GroupClass]
     */
    @PATCH("v1/workspaces/{workspaceId}/group-classes/{classId}")
    suspend fun updateGroupClass(@Path("workspaceId") workspaceId: java.util.UUID, @Path("classId") classId: java.util.UUID, @Body updateGroupClassRequest: UpdateGroupClassRequest): Response<GroupClass>

    /**
     * PATCH v1/workspaces/{workspaceId}/sessions/{sessionId}
     * Change one date of a class
     * Changes the start, end and/or capacity of one date of a class (the Owner only), from the version the caller read (&#x60;409&#x60; with the date as it is now when it changed since). The date stays on its day. Times are wall-clock in the workspace’s time zone with the same daylight saving rules as scheduling. A start sent alone keeps the end at its time of day; when that is not after the new start the answer is &#x60;400&#x60; on &#x60;localEnd&#x60;. An end that is not after the start answers &#x60;400&#x60; on &#x60;localEnd&#x60; (&#x60;end_before_start&#x60;). The class and its other dates are not touched. A session that is not a class date of the workspace (a private session too) answers &#x60;404&#x60;. A new time that puts the date’s trainer where they already have a scheduled session of this workspace (with &#x60;scope: following&#x60;: any date it moves) answers &#x60;409&#x60; with the code &#x60;trainer_conflict&#x60; and those sessions unless &#x60;allowConflicts&#x60; is &#x60;true&#x60; (PS-07); a change of the capacity alone is never checked, and the version is checked first.
     * Responses:
     *  - 200: The date with its changes.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 409: The date changed since the version in the request (`class_date_changed`), it was cancelled (`session_cancelled`, F026), or the trainer already has something at the new time (`trainer_conflict`); nothing was written.
     *  - 422: The `level` is not one of the four values nor `null`. `issues` names the field. Nothing is stored.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param sessionId The session ID.
     * @param updateGroupClassDateRequest 
     * @return [UpdatedClassDate]
     */
    @PATCH("v1/workspaces/{workspaceId}/sessions/{sessionId}")
    suspend fun updateGroupClassDate(@Path("workspaceId") workspaceId: java.util.UUID, @Path("sessionId") sessionId: java.util.UUID, @Body updateGroupClassDateRequest: UpdateGroupClassDateRequest): Response<UpdatedClassDate>

    /**
     * PATCH v1/workspaces/{workspaceId}/group-classes/{classId}/series/{seriesId}
     * Change a whole series of a class
     * Changes the start, length, capacity and/or trainer of a weekly series (the Owner only), from the version the caller read (&#x60;409&#x60; with the series as it is now when it changed since). The change applies from the series’ first date that has not started, as “this and following” (CO-04): started dates and cancelled ones stay as they are, and dates that were changed on their own keep their changes (&#x60;keptDates&#x60; counts them). When earlier dates have started the series is split there, so the answer is the series that now runs from that date (it has a new ID); the earlier one ends the week before. Times are wall-clock in the workspace’s time zone: a start the clocks skip on one of the dates it would reach answers &#x60;400&#x60; on &#x60;localStartTime&#x60; (&#x60;time_does_not_exist&#x60;) with that &#x60;date&#x60;, a length that is no step &#x60;400&#x60; on &#x60;durationMinutes&#x60; (&#x60;invalid_duration&#x60;), and a series with no date left to change &#x60;400&#x60; on &#x60;seriesId&#x60; (&#x60;no_upcoming_dates&#x60;); nothing is changed then. A trainer who already has a scheduled session of this workspace at the new time answers &#x60;409&#x60; with the code &#x60;trainer_conflict&#x60; unless &#x60;allowConflicts&#x60; is &#x60;true&#x60; (PS-07); the version is checked first. A series or class that is not in the workspace answers &#x60;404&#x60;.
     * Responses:
     *  - 200: The series as it now runs.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 409: The series changed since the version in the request (`series_changed`), or the trainer already has something at the new time (`trainer_conflict`); nothing was written.
     *  - 422: The `level` is not one of the four values nor `null`. `issues` names the field. Nothing is stored.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param classId The class ID.
     * @param seriesId The series ID.
     * @param updateClassSeriesRequest 
     * @return [UpdatedClassSeries]
     */
    @PATCH("v1/workspaces/{workspaceId}/group-classes/{classId}/series/{seriesId}")
    suspend fun updateGroupClassSeries(@Path("workspaceId") workspaceId: java.util.UUID, @Path("classId") classId: java.util.UUID, @Path("seriesId") seriesId: java.util.UUID, @Body updateClassSeriesRequest: UpdateClassSeriesRequest): Response<UpdatedClassSeries>

}

package app.fivvi.api.apis

import app.fivvi.api.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

import app.fivvi.api.models.ClassDateChanged
import app.fivvi.api.models.ClassSeries
import app.fivvi.api.models.CreateGroupClassRequest
import app.fivvi.api.models.CreatedGroupClass
import app.fivvi.api.models.Forbidden
import app.fivvi.api.models.GroupClass
import app.fivvi.api.models.NotFound
import app.fivvi.api.models.NotSignedIn
import app.fivvi.api.models.ScheduleGroupClassDateRequest
import app.fivvi.api.models.ScheduledClassDate
import app.fivvi.api.models.UpdateGroupClassDateRequest
import app.fivvi.api.models.UpdateGroupClassRequest
import app.fivvi.api.models.UpdatedClassDate
import app.fivvi.api.models.ValidationError

interface GroupClassesApi {
    /**
     * POST v1/workspaces/{workspaceId}/group-classes
     * Create a class
     * Creates a class (the Owner only; a Trainer gets &#x60;403&#x60;). Empty or too long texts, a capacity outside 1 to 100 and a duration outside 15 to 240 minutes in steps of 5 answer &#x60;400&#x60; with the field in &#x60;issues&#x60;. With a &#x60;firstDate&#x60; the class is also put on that date (the apps’ quick create), both in one transaction: a refused date answers &#x60;400&#x60; and leaves no class. A trainer who does not train in the workspace answers &#x60;404&#x60;.
     * Responses:
     *  - 201: The class was created.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
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
     * POST v1/workspaces/{workspaceId}/group-classes/{classId}/dates
     * Put a class on a date
     * Schedules the class on a date (the Owner only): a &#x60;group&#x60; session at the local start, taking the class’s trainer, capacity and duration (a trainer or capacity in the request wins for this date; &#x60;trainerId: null&#x60; plans it without a trainer) and the workspace’s default location, stored and answered as UTC instants plus the workspace’s time zone. A start the clocks skip answers &#x60;400&#x60; on &#x60;localStart&#x60; (&#x60;time_does_not_exist&#x60;); one they repeat takes the first. With &#x60;repeat: weekly&#x60; (F022) it also makes the weekly series and its next 12 weeks of dates in the same transaction; the answer is the first date with &#x60;datesAdded&#x60;. A class or trainer that is not in the workspace answers &#x60;404&#x60;.
     * Responses:
     *  - 201: The class was scheduled; with a weekly repeat, its first date and how many were made.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
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
     * Changes the start, end and/or capacity of one date of a class (the Owner only), from the version the caller read (&#x60;409&#x60; with the date as it is now when it changed since). The date stays on its day. Times are wall-clock in the workspace’s time zone with the same daylight saving rules as scheduling. A start sent alone keeps the end at its time of day; when that is not after the new start the answer is &#x60;400&#x60; on &#x60;localEnd&#x60;. An end that is not after the start answers &#x60;400&#x60; on &#x60;localEnd&#x60; (&#x60;end_before_start&#x60;). The class and its other dates are not touched. A session that is not a class date of the workspace (a private session too) answers &#x60;404&#x60;.
     * Responses:
     *  - 200: The date with its changes.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 409: The date changed since the version in the request; nothing was written.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param sessionId The session ID.
     * @param updateGroupClassDateRequest 
     * @return [UpdatedClassDate]
     */
    @PATCH("v1/workspaces/{workspaceId}/sessions/{sessionId}")
    suspend fun updateGroupClassDate(@Path("workspaceId") workspaceId: java.util.UUID, @Path("sessionId") sessionId: java.util.UUID, @Body updateGroupClassDateRequest: UpdateGroupClassDateRequest): Response<UpdatedClassDate>

}

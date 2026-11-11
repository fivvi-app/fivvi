package app.fivvi.api.apis

import app.fivvi.api.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

import app.fivvi.api.models.AccessLogList
import app.fivvi.api.models.Forbidden
import app.fivvi.api.models.NotFound
import app.fivvi.api.models.NotSignedIn
import app.fivvi.api.models.ValidationError

interface PrivacyApi {

    /**
    * enum for parameter action
    */
    @Serializable
    enum class ActionListAccessLog(val value: kotlin.String) {
        @SerialName(value = "client.exported") CLIENT_PERIOD_EXPORTED("client.exported"),
        @SerialName(value = "client.trashed") CLIENT_PERIOD_TRASHED("client.trashed"),
        @SerialName(value = "client.restored") CLIENT_PERIOD_RESTORED("client.restored"),
        @SerialName(value = "client.purged") CLIENT_PERIOD_PURGED("client.purged"),
        @SerialName(value = "workspace.exported") WORKSPACE_PERIOD_EXPORTED("workspace.exported"),
        @SerialName(value = "client.retention_kept") CLIENT_PERIOD_RETENTION_KEPT("client.retention_kept"),
        @SerialName(value = "note.viewed") NOTE_PERIOD_VIEWED("note.viewed"),
        @SerialName(value = "note.changed") NOTE_PERIOD_CHANGED("note.changed")
    }

    /**
     * GET v1/workspaces/{workspaceId}/access-log
     * The access log of a workspace
     * The access log of the workspace (the Owner only; a Trainer gets &#x60;403&#x60;): who exported, trashed, restored or purged which client, and from M7 who viewed or changed which note. This workspace’s entries only, newest first, one page at a time, optionally of one client and one action. Names are looked up now; a client who no longer exists reads as *Verwijderde klant* or *Deleted client* in the reader’s language. Entries hold IDs and a time, never a note’s text. Entries older than 12 months are deleted.
     * Responses:
     *  - 200: One page of the access log.
     *  - 400: The request did not match the contract.
     *  - 401: Nobody is signed in: no valid sign-in session or bearer token.
     *  - 403: The caller has a place in the workspace that this route’s access doesn’t allow.
     *  - 404: The caller has no place in the workspace, or the record is out of the caller’s reach.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param workspaceId The workspace ID.
     * @param clientId Only the entries about this client. Also finds those of a client who is deleted since. An ID that belongs to no client of this workspace finds nothing. (optional)
     * @param action Only the entries of this action. (optional)
     * @param pageSize How many entries a page holds, 1 to 100; 50 by default. (optional, default to 50)
     * @param page Which page, counted from 1, newest first; 1 by default. (optional, default to 1)
     * @return [AccessLogList]
     */
    @GET("v1/workspaces/{workspaceId}/access-log")
    suspend fun listAccessLog(@Path("workspaceId") workspaceId: java.util.UUID, @Query("clientId") clientId: java.util.UUID? = null, @Query("action") action: ActionListAccessLog? = null, @Query("pageSize") pageSize: kotlin.Int? = 50, @Query("page") page: kotlin.Int? = 1): Response<AccessLogList>

}

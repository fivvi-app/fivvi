package app.fivvi.pro.home

import app.fivvi.api.apis.TrainersApi
import app.fivvi.api.models.Trainer
import app.fivvi.api.models.TrainerProfile
import java.util.UUID
import okhttp3.ResponseBody.Companion.toResponseBody
import retrofit2.Response

/** The generated client's own API interface; only the Owner's switch (`PUT` and `DELETE` of the trainer profile) is answered. */
class FakeTrainersApi : TrainersApi {
    /** Every workspace the switch was set on, in order: `true` is `PUT` (on), `false` is `DELETE` (off). */
    val switches = mutableListOf<Pair<UUID, Boolean>>()

    /** What the next switch calls fail with, when set: a refusal (`403`, `404`) or an exception such as `IOException`. */
    var failure: (suspend () -> Nothing)? = null

    /** The switch calls fail with this status, as the API answers a Trainer's call (403) or a lost place (404). */
    fun refuse(status: Int) {
        failure = { throw RefusedException(status) }
    }

    class RefusedException(val status: Int) : Exception()

    override suspend fun putTrainerProfile(workspaceId: UUID): Response<TrainerProfile> {
        switches += workspaceId to true
        try {
            failure?.invoke()
        } catch (refused: RefusedException) {
            return Response.error(refused.status, "{}".toResponseBody())
        }
        return Response.success(TrainerProfile(UUID.randomUUID(), TrainerProfile.TrainsHere.TRUE))
    }

    override suspend fun deleteTrainerProfile(workspaceId: UUID): Response<Unit> {
        switches += workspaceId to false
        try {
            failure?.invoke()
        } catch (refused: RefusedException) {
            return Response.error(refused.status, "{}".toResponseBody())
        }
        return Response.success(Unit)
    }

    override suspend fun listTrainers(workspaceId: UUID): Response<List<Trainer>> =
        error("FakeTrainersApi.listTrainers is not expected in this test")
}

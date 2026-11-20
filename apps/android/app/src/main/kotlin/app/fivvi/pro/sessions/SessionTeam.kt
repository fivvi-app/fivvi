package app.fivvi.pro.sessions

import app.fivvi.api.apis.TrainersApi
import app.fivvi.api.models.Trainer
import java.io.IOException
import java.net.HttpURLConnection.HTTP_FORBIDDEN
import java.net.HttpURLConnection.HTTP_NOT_FOUND
import java.util.UUID
import kotlinx.serialization.SerializationException

/** Why a read the session screens need didn't give its answer. */
enum class SessionLoadError {
    /** The API answered `403` or `404`: the person has no access to this (any more), or it is gone. */
    Gone,

    /** The API couldn't be reached. */
    Offline,

    /** Any other answer. */
    Failed,
}

/** A read of the session screens that failed, with the reason; thrown inside this package only. */
internal class SessionLoadException(val error: SessionLoadError) : Exception()

/**
 * The trainers of the workspace and who of them the person is: the trainer whose ID is the person's own team-member ID
 * (`MeWorkspace.teamMemberId` of `GET /api/v1/me`). Never found by address or name.
 */
object SessionTeam {
    /** The team-member ID of the person when it is among [trainers] (an Owner who doesn't train is not), else `null`. */
    fun myTrainerId(trainers: List<Trainer>, teamMemberId: UUID): UUID? =
        trainers.firstOrNull { it.id == teamMemberId }?.id

    /** `GET …/trainers`. A read that doesn't answer throws a [SessionLoadException]. */
    internal suspend fun read(trainersApi: TrainersApi, workspaceId: UUID): List<Trainer> {
        val response = try {
            trainersApi.listTrainers(workspaceId)
        } catch (_: IOException) {
            throw SessionLoadException(SessionLoadError.Offline)
        } catch (_: SerializationException) {
            throw SessionLoadException(SessionLoadError.Failed)
        }
        return response.body()?.takeIf { response.isSuccessful } ?: throw SessionLoadException(
            if (response.code() == HTTP_FORBIDDEN || response.code() == HTTP_NOT_FOUND) {
                SessionLoadError.Gone
            } else {
                SessionLoadError.Failed
            },
        )
    }
}

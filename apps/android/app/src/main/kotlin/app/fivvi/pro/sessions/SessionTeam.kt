package app.fivvi.pro.sessions

import app.fivvi.api.apis.TeamApi
import app.fivvi.api.apis.TrainersApi
import app.fivvi.api.models.TeamMember
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
 * The trainers of the workspace and who of them the person is. The API has no "me" on a trainer: the Owner reads the team
 * (`team.view`) and finds their own place by the address they sign in with, as the web does; a Trainer can't read the
 * team, so their name finds them among the trainers, and only when no other trainer has the same name.
 */
object SessionTeam {
    class Team(
        val trainers: List<Trainer>,
        /** `null` when the team wasn't asked for or its read failed. */
        val members: List<TeamMember>?,
        val teamRequested: Boolean,
    )

    /**
     * The team-member ID of the person among [trainers], or `null` when they can't be told. [teamRequested] says the person
     * may read the team: when that read then failed ([members] is `null`), they aren't told by name either, as a namesake
     * could be taken for them.
     */
    fun myTrainerId(
        trainers: List<Trainer>,
        members: List<TeamMember>?,
        teamRequested: Boolean,
        email: String,
        name: String?,
    ): UUID? {
        if (members != null) {
            val mine = members.firstOrNull { it.email.equals(email, ignoreCase = true) }
            return trainers.firstOrNull { it.id == mine?.id }?.id
        }
        if (teamRequested || name.isNullOrEmpty()) return null
        return trainers.filter { it.name == name }.singleOrNull()?.id
    }

    /**
     * `GET …/trainers`, and with [readTeam] `GET …/team-members` too ([Team.teamRequested] then says so, whether or not the
     * read gave the members). A trainers read that doesn't answer throws a [SessionLoadException].
     */
    internal suspend fun read(trainersApi: TrainersApi, teamApi: TeamApi, workspaceId: UUID, readTeam: Boolean): Team {
        val response = try {
            trainersApi.listTrainers(workspaceId)
        } catch (_: IOException) {
            throw SessionLoadException(SessionLoadError.Offline)
        } catch (_: SerializationException) {
            throw SessionLoadException(SessionLoadError.Failed)
        }
        val trainers = response.body()?.takeIf { response.isSuccessful } ?: throw SessionLoadException(
            if (response.code() == HTTP_FORBIDDEN || response.code() == HTTP_NOT_FOUND) {
                SessionLoadError.Gone
            } else {
                SessionLoadError.Failed
            },
        )
        if (!readTeam) return Team(trainers, null, false)
        val members = try {
            teamApi.listTeamMembers(workspaceId).let { team -> team.body()?.takeIf { team.isSuccessful } }
        } catch (_: IOException) {
            null
        } catch (_: SerializationException) {
            null
        }
        return Team(trainers, members, true)
    }
}

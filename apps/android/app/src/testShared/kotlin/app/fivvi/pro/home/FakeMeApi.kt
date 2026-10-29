package app.fivvi.pro.home

import app.fivvi.api.apis.MeApi
import app.fivvi.api.models.MeResponse
import app.fivvi.api.models.MeWorkspace
import java.util.UUID
import retrofit2.Response

/** The generated client's own API interface, answering each call with the next queued answer. */
class FakeMeApi : MeApi {
    val answers = ArrayDeque<suspend () -> Response<MeResponse>>()
    var calls = 0
        private set

    override suspend fun getMe(): Response<MeResponse> {
        calls++
        return answers.removeFirst()()
    }

    /** The account has a workspace by default, so the screens that don't care which state they are in show the home. */
    fun answerAccount(
        email: String = "owner@example.com",
        id: UUID = UUID.randomUUID(),
        workspaces: List<String> = listOf("John's Gym"),
        canCreateWorkspace: Boolean = false,
    ) {
        answers += {
            Response.success(
                MeResponse(
                    id = id,
                    email = email,
                    name = "Owner",
                    preferredLocale = MeResponse.PreferredLocale.NL_NL,
                    canCreateWorkspace = canCreateWorkspace,
                    workspaces = workspaces.map { MeWorkspace(UUID.randomUUID(), it, "slug", MeWorkspace.Role.OWNER) },
                ),
            )
        }
    }
}

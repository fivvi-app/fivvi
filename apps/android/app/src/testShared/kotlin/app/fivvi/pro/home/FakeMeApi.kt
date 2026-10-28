package app.fivvi.pro.home

import app.fivvi.api.apis.MeApi
import app.fivvi.api.models.MeResponse
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

    fun answerAccount(email: String = "owner@example.com", id: UUID = UUID.randomUUID()) {
        answers += {
            Response.success(
                MeResponse(
                    id = id,
                    email = email,
                    name = "Owner",
                    preferredLocale = MeResponse.PreferredLocale.NL_NL,
                    canCreateWorkspace = false,
                    workspaces = emptyList(),
                ),
            )
        }
    }
}

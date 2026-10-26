package app.fivvi.pro.signin

import app.fivvi.api.apis.SignInApi
import app.fivvi.api.models.SignInRequest
import app.fivvi.api.models.SignInTokenRequest
import app.fivvi.api.models.SignInTokenResponse
import okhttp3.ResponseBody.Companion.toResponseBody
import retrofit2.Response

/** The generated client's own API interface, answering each call with the next queued answer. */
class FakeSignInApi : SignInApi {
    val requestAnswers = ArrayDeque<suspend () -> Response<Unit>>()
    val tokenAnswers = ArrayDeque<suspend () -> Response<SignInTokenResponse>>()
    val signOutAnswers = ArrayDeque<suspend () -> Response<Unit>>()
    val requests = mutableListOf<SignInRequest>()
    val exchanges = mutableListOf<SignInTokenRequest>()
    var signOuts = 0
        private set

    override suspend fun requestSignIn(signInRequest: SignInRequest): Response<Unit> {
        requests += signInRequest
        return requestAnswers.removeFirst()()
    }

    override suspend fun exchangeSignInCode(signInTokenRequest: SignInTokenRequest): Response<SignInTokenResponse> {
        exchanges += signInTokenRequest
        return tokenAnswers.removeFirst()()
    }

    override suspend fun signOut(): Response<Unit> {
        signOuts++
        return signOutAnswers.removeFirst()()
    }

    /** The neutral answer of `POST /v1/sign-in/request`. */
    fun answerAccepted() {
        requestAnswers += { Response.success(202, Unit) }
    }

    /** The answer of `POST /v1/sign-out`: the sign-in session ended. */
    fun answerSignedOut() {
        signOutAnswers += { Response.success(204, Unit) }
    }

    fun answerToken(token: String = "token-1") {
        tokenAnswers += { Response.success(SignInTokenResponse(token)) }
    }

    fun answerCodeRefused() {
        tokenAnswers += { Response.error(401, "{}".toResponseBody()) }
    }
}

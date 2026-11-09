package app.fivvi.core.auth

import app.fivvi.api.apis.SignInApi
import java.io.IOException
import java.net.HttpURLConnection.HTTP_UNAUTHORIZED
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.SerializationException

/**
 * Ends this phone's sign-in session (F001 AC10), for the screen that offers *Uitloggen* in either app. [start] deletes
 * the token first, so a phone that is switched off or an app that is killed meanwhile opens signed out; the request
 * goes out with a copy of it, through [signOutApi] (the generated client). Then the sign-in screen is shown, whatever
 * the answer and also without a connection (the server's session ends by itself after 30 days without use). A
 * connection that hangs is not waited for longer than [timeout]; the request goes on in the background. A 401 that
 * arrives within the wait shows the notice of a refused token.
 *
 * [scope] is the screen's view model scope. The clock of the wait is the one of its dispatcher, so tests set it with
 * virtual time. Storing and deleting the token is file I/O, so it runs on [io].
 */
class SignOut(
    private val session: Session,
    private val signOutApi: (token: String) -> SignInApi,
    private val scope: CoroutineScope,
    private val io: CoroutineDispatcher = Dispatchers.IO,
    private val timeout: Duration = TIMEOUT,
) {
    private val _signingOut = MutableStateFlow(false)

    /** A sign-out is under way: the screen shows it and ignores another tap. */
    val signingOut: StateFlow<Boolean> = _signingOut.asStateFlow()

    fun start() {
        if (_signingOut.value) return
        _signingOut.value = true
        scope.launch {
            val token = withContext(io) { session.detachToken() }
            val refused = token != null && requestSignOut(token)
            _signingOut.value = false
            session.signedOut(afterRejection = refused)
        }
    }

    // Whether the API refused [token]; false when it said anything else, did not answer or the wait ran out. The request
    // is its own coroutine, so giving up on the wait doesn't cancel it.
    private suspend fun requestSignOut(token: String): Boolean {
        val request = scope.async(io) {
            try {
                signOutApi(token).signOut().code() == HTTP_UNAUTHORIZED
            } catch (_: IOException) {
                false
            } catch (_: SerializationException) {
                false
            }
        }
        return withTimeoutOrNull(timeout) { request.await() } ?: false
    }

    companion object {
        /** How long a sign-out waits for the API before it goes on without an answer. */
        val TIMEOUT = 10.seconds
    }
}

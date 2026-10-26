package app.fivvi.pro.auth

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Whether the app is signed in. [generation] changes with every sign-in and sign-out, so screens (and their view
 * models) belong to one sign-in and a new one starts fresh. [afterRejection] is true when the API stopped accepting the
 * token, so the sign-in screen says so (AC9).
 */
data class AuthState(val signedIn: Boolean, val generation: Int, val afterRejection: Boolean = false)

/** The app's sign-in session: the token in its [SessionStore] and what the screens observe of it. */
class Session(private val store: SessionStore) {
    private var token: String? = store.read()
    private val _state = MutableStateFlow(AuthState(signedIn = token != null, generation = 0))
    val state: StateFlow<AuthState> = _state.asStateFlow()

    @Synchronized
    fun token(): String? = token

    @Synchronized
    fun signIn(newToken: String) {
        store.save(newToken)
        token = newToken
        publish(signedIn = true, afterRejection = false)
    }

    /**
     * The API no longer accepts [rejected] (a 401 to a request that carried it): delete it and sign out with the
     * notice. A late answer to an older token is ignored, so it can't sign out a newer sign-in.
     */
    @Synchronized
    fun expire(rejected: String) {
        if (token != rejected) return
        store.delete()
        token = null
        publish(signedIn = false, afterRejection = true)
    }

    /**
     * The first step of a sign-out (AC10): deletes the token and returns it, so the request that ends the sign-in
     * session can still carry it. The screen stays until [signedOut]; requests meanwhile carry no token, and a late
     * answer for this one is ignored by [expire].
     */
    @Synchronized
    fun detachToken(): String? {
        val detached = token
        store.delete()
        token = null
        return detached
    }

    /**
     * The person signed out: show the sign-in screen. [afterRejection] is true when the API refused the token of the
     * sign-out call itself, so the screen says so, as for any refused token. Does nothing when the app is signed out
     * already, e.g. because the API rejected the token in the same moment (then that notice stays).
     */
    @Synchronized
    fun signedOut(afterRejection: Boolean = false) {
        if (!_state.value.signedIn) return
        publish(signedIn = false, afterRejection = afterRejection)
    }

    private fun publish(signedIn: Boolean, afterRejection: Boolean) {
        _state.value = AuthState(signedIn, _state.value.generation + 1, afterRejection)
    }
}

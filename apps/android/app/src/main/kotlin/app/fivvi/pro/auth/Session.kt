package app.fivvi.pro.auth

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Whether the app is signed in. [generation] changes with every sign-in and sign-out, so screens (and their view
 * models) belong to one sign-in and a new one starts fresh.
 */
data class AuthState(val signedIn: Boolean, val generation: Int)

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
        publish()
    }

    /**
     * The API no longer accepts [rejected] (a 401 to a request that carried it): delete it and sign out. A late answer
     * to an older token is ignored, so it can't sign out a newer sign-in.
     */
    @Synchronized
    fun expire(rejected: String) {
        if (token != rejected) return
        store.delete()
        token = null
        publish()
    }

    private fun publish() {
        _state.value = AuthState(signedIn = token != null, generation = _state.value.generation + 1)
    }
}

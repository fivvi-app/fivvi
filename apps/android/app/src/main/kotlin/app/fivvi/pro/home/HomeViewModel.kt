package app.fivvi.pro.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fivvi.api.apis.MeApi
import app.fivvi.api.apis.SignInApi
import app.fivvi.api.apis.WorkspacesApi
import app.fivvi.api.models.MeResponse
import app.fivvi.pro.auth.Session
import java.io.IOException
import java.net.HttpURLConnection.HTTP_NOT_FOUND
import java.net.HttpURLConnection.HTTP_UNAUTHORIZED
import java.util.UUID
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.SerializationException

sealed interface MeState {
    data object Loading : MeState

    data class Loaded(val email: String, val destination: HomeDestination) : MeState

    data object Failed : MeState
}

/**
 * What the home shows once `GET /v1/me` has answered (F002 AC10). The API decides: the account's workspaces and
 * `canCreateWorkspace`; the app has no rule of its own about who may set one up.
 */
sealed interface HomeDestination {
    /** The account has a workspace: the app's home (a placeholder until Vandaag) with the workspace's name. */
    data class Workspace(val name: String, val id: UUID) : HomeDestination

    /** No workspace, and the API says the account may create one: set it up on the web. */
    data object SetUpOnWeb : HomeDestination

    /** No workspace, and the account may not create one. */
    data object NoAccess : HomeDestination
}

/**
 * Loads the signed-in account through the generated client (`GET /api/v1/me`, with the token the auth layer adds).
 * When the API no longer accepts the token (401) the auth layer signs the app out, and this screen goes away. It also
 * signs the person out on request ([signOut], F001 AC10).
 *
 * [refresh] runs when the app comes back to the foreground (F003 AC6): it reads the workspace being shown, and a 404 (the
 * person was removed from its team) makes the screen ask `GET /api/v1/me` again, which shows their other workspace or the
 * no-access text, without a sign-out.
 *
 * [signOutApi] is the generated client for one sign-out request that carries the token it is given. [signOutTimeout] is
 * how long a sign-out waits for the API before it goes on without an answer: the clock is the one of the coroutine
 * dispatcher, so tests set it with virtual time. Storing and deleting the token is file I/O, so it runs on [io].
 * [onAccount] is told the account's ID (a UUID) once `GET /api/v1/me` has answered: the app sets it as the error-reporting
 * user (F001 AC2, #266) unless the sign-in has ended meanwhile; [Session] clears it again on sign-out.
 * [onPreferredLocale] is told the account's stored language at the same time (F010 AC2, AC5).
 */
class HomeViewModel(
    private val api: MeApi,
    private val workspaceApi: WorkspacesApi,
    private val session: Session,
    private val signOutApi: (token: String) -> SignInApi,
    private val onAccount: (id: String) -> Unit,
    private val io: CoroutineDispatcher = Dispatchers.IO,
    private val signOutTimeout: Duration = SIGN_OUT_TIMEOUT,
    private val onPreferredLocale: (MeResponse.PreferredLocale?) -> Unit = {},
) : ViewModel() {
    private val _state = MutableStateFlow<MeState>(MeState.Loading)
    val state: StateFlow<MeState> = _state.asStateFlow()
    private val _signingOut = MutableStateFlow(false)

    /** A sign-out is under way: the home shows it and ignores another tap. */
    val signingOut: StateFlow<Boolean> = _signingOut.asStateFlow()
    private var loading: Job? = null

    // The sign-in this screen belongs to (see MainActivity: one view model per generation).
    private val generation = session.state.value.generation

    init {
        load()
    }

    fun retry() = load()

    /**
     * The app is in the foreground again. A 404 for the workspace being shown means the person is no longer on its team
     * (ADR-006: the same answer as for a workspace that does not exist): the account is read again, and its workspaces
     * decide what shows. Any other answer, and no answer, leave the screen as it is.
     */
    fun refresh() {
        val shown = (_state.value as? MeState.Loaded)?.destination as? HomeDestination.Workspace ?: return
        viewModelScope.launch {
            val gone = try {
                workspaceApi.getWorkspace(shown.id).code() == HTTP_NOT_FOUND
            } catch (_: IOException) {
                false
            } catch (_: SerializationException) {
                false
            }
            if (gone) load()
        }
    }

    /**
     * Ends this phone's sign-in session. The token is deleted first, so a phone that is switched off or an app that is
     * killed meanwhile opens signed out; the request goes out with a copy of it, through the generated client. Then the
     * sign-in screen is shown, whatever the answer and also without a connection (the server's session ends by itself
     * after 30 days without use). A connection that hangs is not waited for longer than the timeout; the request goes
     * on in the background. A 401 that arrives within the wait shows the notice of a refused token.
     */
    fun signOut() {
        if (_signingOut.value) return
        _signingOut.value = true
        viewModelScope.launch {
            val token = withContext(io) { session.detachToken() }
            val refused = token != null && requestSignOut(token)
            _signingOut.value = false
            session.signedOut(afterRejection = refused)
        }
    }

    private fun load() {
        loading?.cancel()
        _state.value = MeState.Loading
        loading = viewModelScope.launch { _state.value = fetch() }
    }

    private suspend fun fetch(): MeState {
        val response = try {
            api.getMe()
        } catch (_: IOException) {
            return MeState.Failed
        } catch (_: SerializationException) {
            return MeState.Failed
        }
        val account = response.body()?.takeIf { response.isSuccessful }
        return account?.let {
            if (stillSignedIn()) {
                onAccount(it.id.toString())
                onPreferredLocale(it.preferredLocale)
            }
            MeState.Loaded(it.email, destination(it))
        } ?: MeState.Failed
    }

    // The first workspace for now; "last workspace used" comes with F012.
    private fun destination(account: MeResponse): HomeDestination = when {
        account.workspaces.isNotEmpty() -> account.workspaces.first().let { HomeDestination.Workspace(it.name, it.id) }
        account.canCreateWorkspace -> HomeDestination.SetUpOnWeb
        else -> HomeDestination.NoAccess
    }

    // An answer that arrives after the sign-out must not set the account that has just been cleared as the error-reporting
    // user (#266): this view model outlives the sign-out in the activity's store.
    private fun stillSignedIn(): Boolean = session.state.value.let { it.signedIn && it.generation == generation }

    // Whether the API refused [token]; false when it said anything else, did not answer or the wait ran out. The request
    // is its own coroutine, so giving up on the wait doesn't cancel it.
    private suspend fun requestSignOut(token: String): Boolean {
        val request = viewModelScope.async(io) {
            try {
                signOutApi(token).signOut().code() == HTTP_UNAUTHORIZED
            } catch (_: IOException) {
                false
            } catch (_: SerializationException) {
                false
            }
        }
        return withTimeoutOrNull(signOutTimeout) { request.await() } ?: false
    }

    private companion object {
        val SIGN_OUT_TIMEOUT = 10.seconds
    }
}

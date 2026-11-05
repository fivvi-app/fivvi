package app.fivvi.client.account

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fivvi.api.apis.MeApi
import app.fivvi.api.apis.SignInApi
import app.fivvi.api.models.MeResponse
import app.fivvi.api.models.MeWorkspace
import app.fivvi.core.auth.Session
import app.fivvi.core.auth.SignOut
import java.io.IOException
import kotlin.time.Duration
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.SerializationException

sealed interface AccountState {
    data object Loading : AccountState

    /**
     * What the client app shows of the account: the name (the account may have none) and the email address, read-only,
     * and whether the account is Owner or Trainer of a workspace. Only that flag, no workspace name, ID or role: the
     * client app shows no team data (E017 AC3).
     */
    data class Loaded(val name: String?, val email: String, val hasTeamRole: Boolean) : AccountState

    data object Failed : AccountState
}

/**
 * Loads the signed-in account through the generated client (`GET /api/v1/me`, with the token the auth layer adds) for
 * the tabs of Fivvi: *Home* and *Boeken* need to know whether to point a trainer to Fivvi Pro, *Profiel* shows the name
 * and the email address. A client belongs to no workspace until F029 and F032, so the no-workspace state is the only
 * one. When the API no longer accepts the token (401) the auth layer signs the app out. [signOut] ends the sign-in
 * ([SignOut], F001 AC10).
 *
 * [refresh] runs when the app comes back to the foreground: it reads the account again without showing the loading state,
 * so a team role gained or lost elsewhere shows, and a failed read leaves the screen as it is.
 *
 * [onAccount] is told the account's ID (a UUID) once `GET /api/v1/me` has answered, unless the sign-in has ended
 * meanwhile: the app sets it as the error-reporting user. [onPreferredLocale] is told the stored language (F010 AC2).
 */
class AccountViewModel(
    private val api: MeApi,
    private val session: Session,
    signOutApi: (token: String) -> SignInApi,
    private val onAccount: (id: String) -> Unit,
    private val onPreferredLocale: (MeResponse.PreferredLocale?) -> Unit,
    io: CoroutineDispatcher = Dispatchers.IO,
    signOutTimeout: Duration = SignOut.TIMEOUT,
) : ViewModel() {
    private val _state = MutableStateFlow<AccountState>(AccountState.Loading)
    val state: StateFlow<AccountState> = _state.asStateFlow()

    private val signOut = SignOut(session, signOutApi, viewModelScope, io, signOutTimeout)

    /** A sign-out is under way: Profiel shows it and ignores another tap. */
    val signingOut: StateFlow<Boolean> = signOut.signingOut

    private var loading: Job? = null

    // The sign-in this screen belongs to (see MainActivity: one view model per generation).
    private val generation = session.state.value.generation

    init {
        load()
    }

    fun retry() = load()

    fun signOut() = signOut.start()

    /** The app is in the foreground again: read the account again, quietly. */
    fun refresh() {
        if (_state.value !is AccountState.Loaded) return
        loading?.cancel()
        loading = viewModelScope.launch {
            val loaded = fetch()
            if (loaded is AccountState.Loaded) _state.value = loaded
        }
    }

    private fun load() {
        loading?.cancel()
        _state.value = AccountState.Loading
        loading = viewModelScope.launch { _state.value = fetch() }
    }

    private suspend fun fetch(): AccountState {
        val response = try {
            api.getMe()
        } catch (_: IOException) {
            return AccountState.Failed
        } catch (_: SerializationException) {
            return AccountState.Failed
        }
        val account = response.body()?.takeIf { response.isSuccessful } ?: return AccountState.Failed
        // An answer that arrives after the sign-out must not set the account that has just been cleared as the
        // error-reporting user: this view model outlives the sign-out in the activity's store.
        if (session.state.value.let { it.signedIn && it.generation == generation }) {
            onAccount(account.id.toString())
            onPreferredLocale(account.preferredLocale)
        }
        return AccountState.Loaded(account.name, account.email, account.workspaces.hasTeamRole())
    }

    private fun List<MeWorkspace>.hasTeamRole() =
        any { it.role == MeWorkspace.Role.OWNER || it.role == MeWorkspace.Role.TRAINER }
}

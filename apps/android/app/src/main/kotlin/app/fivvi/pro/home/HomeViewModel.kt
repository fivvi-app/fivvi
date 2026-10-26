package app.fivvi.pro.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fivvi.api.apis.MeApi
import java.io.IOException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.SerializationException

sealed interface MeState {
    data object Loading : MeState

    data class Loaded(val email: String) : MeState

    data object Failed : MeState
}

/**
 * Loads the signed-in account through the generated client (`GET /api/v1/me`, with the token the auth layer adds).
 * When the API no longer accepts the token (401) the auth layer signs the app out, and this screen goes away.
 */
class HomeViewModel(private val api: MeApi) : ViewModel() {
    private val _state = MutableStateFlow<MeState>(MeState.Loading)
    val state: StateFlow<MeState> = _state.asStateFlow()
    private var loading: Job? = null

    init {
        load()
    }

    fun retry() = load()

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
        return account?.let { MeState.Loaded(it.email) } ?: MeState.Failed
    }
}

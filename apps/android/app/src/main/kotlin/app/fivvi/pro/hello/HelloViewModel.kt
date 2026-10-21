package app.fivvi.pro.hello

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fivvi.api.apis.HelloApi
import app.fivvi.api.models.Locale as ApiLocale
import app.fivvi.pro.R
import java.io.IOException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.SerializationException

sealed interface HelloState {
    data object Loading : HelloState

    data class Loaded(@param:StringRes val greeting: Int) : HelloState

    data object Failed : HelloState
}

/** Loads the greeting in [locale] through the generated client. A greeting key the app doesn't know is [HelloState.Failed]. */
class HelloViewModel(private val api: HelloApi, private val locale: ApiLocale) : ViewModel() {
    private val _state = MutableStateFlow<HelloState>(HelloState.Loading)
    val state: StateFlow<HelloState> = _state.asStateFlow()
    private var loading: Job? = null

    init {
        load()
    }

    fun retry() = load()

    private fun load() {
        loading?.cancel()
        _state.value = HelloState.Loading
        loading = viewModelScope.launch { _state.value = fetch() }
    }

    private suspend fun fetch(): HelloState {
        val response = try {
            api.getHello(locale)
        } catch (_: IOException) {
            return HelloState.Failed
        } catch (_: SerializationException) {
            return HelloState.Failed
        }
        val greeting = response.body()?.takeIf { response.isSuccessful }?.let { GREETINGS[it.greetingKey] }
        return greeting?.let(HelloState::Loaded) ?: HelloState.Failed
    }

    private companion object {
        /** The catalog keys `GET /api/v1/hello` may return, with their generated string resources. */
        val GREETINGS = mapOf("hello.title" to R.string.hello_title)
    }
}

package app.fivvi.pro

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fivvi.api.apis.MeApi
import app.fivvi.api.models.MeResponse
import app.fivvi.api.models.UpdateMeRequest
import java.io.IOException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.SerializationException

/**
 * Keeps the language of the device and the account's stored preference one (F010 AC2, AC3, AC5), through the generated
 * client: [choose] applies the language at once and saves it with `PATCH /api/v1/me`; [onStored] and [refresh] (the app
 * came to the foreground) take what `GET /api/v1/me` says: a choice that the account does not have yet (made on the
 * sign-in screen) is saved, otherwise the stored preference is adopted and replaces the older local choice. The app has
 * no language rule of its own beyond the order of [AppLanguage.resolve].
 */
class LanguageViewModel(private val api: MeApi, private val preference: LanguagePreference) : ViewModel() {
    val language: StateFlow<AppLanguage> = preference.language

    private val _saveFailed = MutableStateFlow(false)

    /** The last save of a choice did not go through; the choice shows anyway and is saved again at the next foreground. */
    val saveFailed: StateFlow<Boolean> = _saveFailed.asStateFlow()

    fun choose(language: AppLanguage) {
        preference.choose(language)
        viewModelScope.launch { save() }
    }

    /** `GET /api/v1/me` answered with [preferred]. */
    fun onStored(preferred: MeResponse.PreferredLocale?) {
        val stored = preferred?.toAppLanguage() ?: return
        viewModelScope.launch { reconcile(stored) }
    }

    /** The app is in the foreground again: read the stored preference. */
    fun refresh() {
        viewModelScope.launch {
            val account = try {
                api.getMe().let { response -> response.body()?.takeIf { response.isSuccessful } }
            } catch (_: IOException) {
                null
            } catch (_: SerializationException) {
                null
            }
            account?.preferredLocale?.toAppLanguage()?.let { reconcile(it) }
        }
    }

    private suspend fun reconcile(stored: AppLanguage) {
        if (preference.unsavedChoice != null) save() else preference.adopt(stored)
    }

    private suspend fun save() {
        val choice = preference.unsavedChoice ?: return
        val saved = try {
            api.updateMe(UpdateMeRequest(choice.toPreferredLocale())).isSuccessful
        } catch (_: IOException) {
            false
        } catch (_: SerializationException) {
            false
        }
        if (saved) preference.saved(choice)
        _saveFailed.value = !saved
    }
}

private fun MeResponse.PreferredLocale.toAppLanguage() = when (this) {
    MeResponse.PreferredLocale.NL_NL -> AppLanguage.DUTCH
    MeResponse.PreferredLocale.EN -> AppLanguage.ENGLISH
}

private fun AppLanguage.toPreferredLocale() = when (this) {
    AppLanguage.DUTCH -> UpdateMeRequest.PreferredLocale.NL_NL
    AppLanguage.ENGLISH -> UpdateMeRequest.PreferredLocale.EN
}

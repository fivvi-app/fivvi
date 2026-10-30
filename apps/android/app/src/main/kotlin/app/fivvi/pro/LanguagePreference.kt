package app.fivvi.pro

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** What the app keeps on the device about the language (F010): not a secret, so plain preferences. */
interface LanguageStore {
    /** The explicit choice made on this device, or the new per-app language set in Android settings. */
    var choice: AppLanguage?

    /** The account's stored preference as last read from `GET /api/v1/me`; kept after sign-out. */
    var stored: AppLanguage?

    /** [choice] is not yet saved on the account (made before sign-in, or the save failed). */
    var unsaved: Boolean
}

class SharedPreferencesLanguageStore(context: Context) : LanguageStore {
    private val preferences = context.getSharedPreferences("language", Context.MODE_PRIVATE)

    override var choice: AppLanguage?
        get() = AppLanguage.fromTag(preferences.getString(CHOICE, null))
        set(value) = preferences.edit().putString(CHOICE, value?.tag).apply()

    override var stored: AppLanguage?
        get() = AppLanguage.fromTag(preferences.getString(STORED, null))
        set(value) = preferences.edit().putString(STORED, value?.tag).apply()

    override var unsaved: Boolean
        get() = preferences.getBoolean(UNSAVED, false)
        set(value) = preferences.edit().putBoolean(UNSAVED, value).apply()

    private companion object {
        const val CHOICE = "choice"
        const val STORED = "stored"
        const val UNSAVED = "unsaved"
    }
}

/**
 * The interface language of the app (F010, ADR-017): the explicit choice on this device, then the account's stored
 * preference, then the OS per-app language and the device languages, then English ([AppLanguage.resolve]). Every change
 * is also set as the platform's per-app language, so the in-app choice and Android's own setting are one. A per-app
 * language that someone set in Android settings and that is not the language shown is a new explicit choice.
 */
class LanguagePreference(private val store: LanguageStore, private val settings: LanguageSettings) {
    private val _language = MutableStateFlow(initial())
    val language: StateFlow<AppLanguage> = _language.asStateFlow()

    /** The choice on this device that the account does not have yet, if any. */
    val unsavedChoice: AppLanguage? get() = store.choice.takeIf { store.unsaved }

    private fun initial(): AppLanguage {
        val perApp = AppLanguage.firstSupported(settings.perAppLanguages)
        if (perApp != null && perApp != (store.choice ?: store.stored)) {
            store.choice = perApp
            store.unsaved = true
        }
        return resolve()
    }

    private fun resolve() = AppLanguage.resolve(
        perApp = settings.perAppLanguages,
        device = settings.deviceLanguages,
        explicit = store.choice,
        stored = store.stored,
    )

    /** The person chose [language] (sign-in switch or Profiel): it applies at once; saving it on the account follows. */
    fun choose(language: AppLanguage) {
        store.choice = language
        store.unsaved = true
        publish()
    }

    /** The API accepted [language] as the account's preference. A newer choice made meanwhile stays unsaved. */
    fun saved(language: AppLanguage) {
        store.stored = language
        if (store.choice == language) store.unsaved = false
    }

    /** The account's stored preference is [stored] (read from the API): it replaces an older local choice. */
    fun adopt(stored: AppLanguage) {
        store.stored = stored
        store.choice = null
        store.unsaved = false
        publish()
    }

    private fun publish() {
        val next = resolve()
        if (next != _language.value) {
            _language.value = next
            settings.applyPerApp(next)
        }
    }
}

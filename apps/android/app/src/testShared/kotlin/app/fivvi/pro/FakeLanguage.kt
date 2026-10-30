package app.fivvi.pro

import java.util.Locale

class InMemoryLanguageStore(
    override var choice: AppLanguage? = null,
    override var stored: AppLanguage? = null,
    override var unsaved: Boolean = false,
) : LanguageStore

/** The OS language inputs as fixed lists; [applied] records what the app sets as the per-app language. */
class FakeLanguageSettings(perApp: List<String> = emptyList(), device: List<String> = emptyList()) : LanguageSettings {
    override var perAppLanguages: List<Locale> = perApp.map(Locale::forLanguageTag)
    override val deviceLanguages: List<Locale> = device.map(Locale::forLanguageTag)
    val applied = mutableListOf<AppLanguage>()

    override fun applyPerApp(language: AppLanguage) {
        applied += language
        perAppLanguages = listOf(language.locale)
    }
}

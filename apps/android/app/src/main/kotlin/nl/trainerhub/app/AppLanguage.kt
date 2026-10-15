package nl.trainerhub.app

import java.util.Locale
import nl.trainerhub.api.models.Locale as ApiLocale

/** The app's interface language (ADR-017): the screen's resources and the `locale` of API calls. */
enum class AppLanguage(val tag: String, val apiLocale: ApiLocale) {
    DUTCH("nl-NL", ApiLocale.NL_NL),
    ENGLISH("en", ApiLocale.EN),
    ;

    val locale: Locale get() = Locale.forLanguageTag(tag)

    companion object {
        /**
         * As `resolveInterfaceLanguage` in packages/i18n: the OS per-app language, then the device languages in order,
         * skipping unsupported ones, then English. Never the language Android resolved the resources to: the default
         * resources are Dutch.
         */
        fun resolve(perApp: List<Locale>, device: List<Locale>): AppLanguage =
            (perApp + device).firstNotNullOfOrNull(::match) ?: ENGLISH

        /** Any `nl-*` is Dutch and any `en-*` English, as `matchLocale` in packages/i18n. */
        private fun match(locale: Locale): AppLanguage? = when (locale.language) {
            "nl" -> DUTCH
            "en" -> ENGLISH
            else -> null
        }
    }
}

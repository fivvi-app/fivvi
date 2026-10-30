package app.fivvi.pro

import app.fivvi.api.models.Locale as ApiLocale
import java.util.Locale

/** The app's interface language (ADR-017): the screen's resources and the `locale` of API calls. */
enum class AppLanguage(val tag: String, val apiLocale: ApiLocale) {
    DUTCH("nl-NL", ApiLocale.NL_NL),
    ENGLISH("en", ApiLocale.EN),
    ;

    val locale: Locale get() = Locale.forLanguageTag(tag)

    companion object {
        /**
         * As `resolveInterfaceLanguage` in packages/i18n (ADR-017): the explicit choice made on this device, then the
         * account's stored preference, then the OS per-app language and the device languages in order, skipping
         * unsupported ones, then English. Never the language Android resolved the resources to: the default resources
         * are Dutch.
         */
        fun resolve(
            perApp: List<Locale>,
            device: List<Locale>,
            explicit: AppLanguage? = null,
            stored: AppLanguage? = null,
        ): AppLanguage = explicit ?: stored ?: (perApp + device).firstNotNullOfOrNull(::match) ?: ENGLISH

        /** The first supported language of [locales], or null. */
        fun firstSupported(locales: List<Locale>): AppLanguage? = locales.firstNotNullOfOrNull(::match)

        /** The language of a stored preference (`nl-NL` or `en`), null for anything else. */
        fun fromTag(tag: String?): AppLanguage? = entries.firstOrNull { it.tag == tag }

        /** Any `nl-*` is Dutch and any `en-*` English, as `matchLocale` in packages/i18n. */
        private fun match(locale: Locale): AppLanguage? = when (locale.language) {
            "nl" -> DUTCH
            "en" -> ENGLISH
            else -> null
        }
    }
}

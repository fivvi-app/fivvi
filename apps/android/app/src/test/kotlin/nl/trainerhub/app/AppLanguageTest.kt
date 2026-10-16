package nl.trainerhub.app

import java.util.Locale
import nl.trainerhub.api.models.Locale as ApiLocale
import org.junit.Assert.assertEquals
import org.junit.Test

// ADR-017: the same cases as `E008 AC3 interface language` in packages/i18n/src/locale.test.ts.
class AppLanguageTest {
    private fun resolve(device: List<String>, perApp: List<String> = emptyList()) = AppLanguage.resolve(
        perApp = perApp.map(Locale::forLanguageTag),
        device = device.map(Locale::forLanguageTag),
    )

    @Test
    fun E008_AC3_unsupportedLanguageFallsBackToEnglish() {
        assertEquals(AppLanguage.ENGLISH, resolve(device = listOf("de-DE")))
        assertEquals(AppLanguage.ENGLISH, resolve(device = listOf("de-DE", "fr-FR")))
        assertEquals(AppLanguage.ENGLISH, resolve(device = emptyList()))
    }

    @Test
    fun E008_AC3_firstSupportedLanguageWins() {
        assertEquals(AppLanguage.DUTCH, resolve(device = listOf("fr-FR", "nl-BE")))
        assertEquals(AppLanguage.ENGLISH, resolve(device = listOf("de-DE", "en-GB", "nl-NL")))
        assertEquals(AppLanguage.DUTCH, resolve(device = listOf("nl")))
        assertEquals(AppLanguage.ENGLISH, resolve(device = listOf("en-US", "nl-NL")))
    }

    @Test
    fun E008_AC3_perAppChoiceWins() {
        assertEquals(AppLanguage.DUTCH, resolve(perApp = listOf("nl"), device = listOf("de-DE")))
        assertEquals(AppLanguage.ENGLISH, resolve(perApp = listOf("en"), device = listOf("nl-NL")))
    }

    @Test
    fun E008_AC3_unsupportedPerAppChoiceIsSkipped() {
        assertEquals(AppLanguage.DUTCH, resolve(perApp = listOf("fr"), device = listOf("nl-BE")))
        assertEquals(AppLanguage.ENGLISH, resolve(perApp = listOf("fr"), device = listOf("de")))
    }

    @Test
    fun E008_AC3_apiLocaleMatchesTheAppLanguage() {
        assertEquals(ApiLocale.NL_NL, AppLanguage.DUTCH.apiLocale)
        assertEquals(ApiLocale.EN, AppLanguage.ENGLISH.apiLocale)
    }
}

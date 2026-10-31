package app.fivvi.pro

import app.fivvi.api.models.Locale as ApiLocale
import java.util.Locale
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

// F010 AC6: the same case names as `AC6: explicit, stored, device, English` in packages/i18n/src/locale.test.ts.
class AppLanguageOrderTest {
    private val dutchPhone = listOf(Locale.forLanguageTag("nl-NL"))

    @Test
    fun AC6_explicit_aChoiceMadeNowWinsOverAStoredPreferenceAndTheDevice() {
        assertEquals(
            AppLanguage.ENGLISH,
            AppLanguage.resolve(
                perApp = emptyList(),
                device = dutchPhone,
                explicit = AppLanguage.ENGLISH,
                stored = AppLanguage.DUTCH,
            ),
        )
    }

    @Test
    fun AC6_stored_theStoredPreferenceWinsOverTheDeviceLanguages() {
        assertEquals(
            AppLanguage.ENGLISH,
            AppLanguage.resolve(perApp = emptyList(), device = dutchPhone, stored = AppLanguage.ENGLISH),
        )
        assertEquals(
            AppLanguage.DUTCH,
            AppLanguage.resolve(
                perApp = emptyList(),
                device = listOf(Locale.forLanguageTag("en-GB")),
                stored = AppLanguage.DUTCH,
            ),
        )
    }

    @Test
    fun AC6_device_theFirstSupportedDeviceLanguageDecidesWithoutAChoice() {
        val device = listOf("fr-FR", "nl-BE", "en-GB").map(Locale::forLanguageTag)
        assertEquals(AppLanguage.DUTCH, AppLanguage.resolve(perApp = emptyList(), device = device))
    }

    @Test
    fun AC6_english_nothingSupportedIsChosenStoredOrRequested() {
        assertEquals(
            AppLanguage.ENGLISH,
            AppLanguage.resolve(perApp = emptyList(), device = listOf(Locale.forLanguageTag("de-DE"))),
        )
        assertEquals(AppLanguage.ENGLISH, AppLanguage.resolve(perApp = emptyList(), device = emptyList()))
    }
}

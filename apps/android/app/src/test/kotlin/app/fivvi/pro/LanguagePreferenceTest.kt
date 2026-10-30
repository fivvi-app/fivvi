package app.fivvi.pro

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test

// F010 (spec #175): the language the app shows, from the choice on the device, the stored preference and the OS.
class LanguagePreferenceTest {
    private val store = InMemoryLanguageStore()
    private val settings = FakeLanguageSettings(device = listOf("en-GB"))
    private fun preference() = LanguagePreference(store, settings)

    @Test
    fun withoutAChoiceTheDeviceLanguageShows() {
        assertEquals(AppLanguage.ENGLISH, preference().language.value)
        assertEquals(emptyList<AppLanguage>(), settings.applied)
    }

    @Test
    fun choosingSwitchesAtOnceKeepsTheChoiceAndSetsThePerAppLanguage() {
        val preference = preference()

        preference.choose(AppLanguage.DUTCH)

        assertEquals(AppLanguage.DUTCH, preference.language.value)
        assertEquals(AppLanguage.DUTCH, store.choice)
        assertEquals(listOf(AppLanguage.DUTCH), settings.applied)
        assertEquals(AppLanguage.DUTCH, preference().language.value)
    }

    @Test
    fun test_F010_AC4_signedOutChoiceKeptLocally() {
        preference().choose(AppLanguage.DUTCH)

        // A new start of the app, still signed out: the choice is read from the device and still waits to be saved.
        val restarted = preference()
        assertEquals(AppLanguage.DUTCH, restarted.language.value)
        assertEquals(AppLanguage.DUTCH, restarted.unsavedChoice)
    }

    @Test
    fun AC6_signOut_theLanguageStaysUntilSomeoneChoosesAnother() {
        val preference = preference()
        preference.adopt(AppLanguage.DUTCH)
        assertEquals(AppLanguage.DUTCH, preference.language.value)

        // Signing out changes nothing here: the next start still shows the language of the account.
        assertEquals(AppLanguage.DUTCH, LanguagePreference(store, settings).language.value)
        preference.choose(AppLanguage.ENGLISH)
        assertEquals(AppLanguage.ENGLISH, LanguagePreference(store, settings).language.value)
    }

    @Test
    fun aSavedChoiceIsNotUnsavedAndANewerOneStays() {
        val preference = preference()
        preference.choose(AppLanguage.DUTCH)
        preference.choose(AppLanguage.ENGLISH)

        preference.saved(AppLanguage.DUTCH)
        assertEquals(AppLanguage.ENGLISH, preference.unsavedChoice)

        preference.saved(AppLanguage.ENGLISH)
        assertNull(preference.unsavedChoice)
    }

    @Test
    fun adoptingTheStoredPreferenceClearsTheOlderLocalChoice() {
        val preference = preference()
        preference.choose(AppLanguage.DUTCH)
        preference.saved(AppLanguage.DUTCH)

        preference.adopt(AppLanguage.ENGLISH)

        assertEquals(AppLanguage.ENGLISH, preference.language.value)
        assertNull(store.choice)
        assertFalse(store.unsaved)
        assertEquals(listOf(AppLanguage.DUTCH, AppLanguage.ENGLISH), settings.applied)
    }

    @Test
    fun aPerAppLanguageSetInAndroidSettingsIsANewChoiceToSave() {
        store.stored = AppLanguage.DUTCH
        settings.perAppLanguages = listOf(java.util.Locale.forLanguageTag("en"))

        val preference = preference()

        assertEquals(AppLanguage.ENGLISH, preference.language.value)
        assertEquals(AppLanguage.ENGLISH, preference.unsavedChoice)
    }

    @Test
    fun theStoredPreferenceBeatsTheDeviceLanguage() {
        store.stored = AppLanguage.DUTCH

        assertEquals(AppLanguage.DUTCH, preference().language.value)
    }
}

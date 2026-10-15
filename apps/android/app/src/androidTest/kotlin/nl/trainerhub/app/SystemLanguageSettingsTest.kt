package nl.trainerhub.app

import android.app.LocaleManager
import android.os.Build
import android.os.LocaleList
import androidx.test.core.app.ApplicationProvider
import java.util.Locale
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test

// AC3: the per-app language from Android settings (API 33+) reaches the resolver, apart from the device languages.
class SystemLanguageSettingsTest {
    private val context = ApplicationProvider.getApplicationContext<TrainerHubApplication>()
    private val localeManager get() = context.getSystemService(LocaleManager::class.java)

    @Before
    fun setUp() = assumeTrue(Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)

    @After
    fun tearDown() {
        localeManager.applicationLocales = LocaleList.getEmptyLocaleList()
    }

    @Test
    fun E008_AC3_perAppChoiceIsRead() {
        localeManager.applicationLocales = LocaleList.forLanguageTags("nl")

        val settings = SystemLanguageSettings(context)

        assertEquals(listOf(Locale.forLanguageTag("nl")), settings.perAppLanguages)
        assertEquals(localeManager.systemLocales.get(0), settings.deviceLanguages.first())
    }
}

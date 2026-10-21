package app.fivvi.pro

import android.content.res.Configuration
import android.os.LocaleList
import androidx.annotation.StringRes
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import app.fivvi.api.apis.HelloApi
import java.util.Locale
import org.junit.rules.ExternalResource

/** Starts [MainActivity] with a fake API client and fake OS language settings, and puts the real ones back after. */
class AppRule : ExternalResource() {
    private val app = ApplicationProvider.getApplicationContext<FivviApplication>()
    private var scenario: ActivityScenario<MainActivity>? = null

    fun launch(api: HelloApi, device: List<String>, perApp: List<String> = emptyList()) {
        app.dependencies = object : AppDependencies {
            override val helloApi = api
            override val languageSettings = object : LanguageSettings {
                override val perAppLanguages = perApp.map(Locale::forLanguageTag)
                override val deviceLanguages = device.map(Locale::forLanguageTag)
            }
        }
        scenario = ActivityScenario.launch(MainActivity::class.java)
    }

    /** The generated catalog's text for [id] in [language]: what the screen should show. */
    fun string(language: AppLanguage, @StringRes id: Int): String {
        val configuration = Configuration(app.resources.configuration).apply { setLocales(LocaleList(language.locale)) }
        return app.createConfigurationContext(configuration).getString(id)
    }

    override fun after() {
        scenario?.close()
        app.dependencies = DefaultAppDependencies(app)
    }
}

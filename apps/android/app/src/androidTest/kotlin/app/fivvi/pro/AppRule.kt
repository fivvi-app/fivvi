package app.fivvi.pro

import android.content.res.Configuration
import android.os.LocaleList
import androidx.annotation.StringRes
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import app.fivvi.api.apis.HelloApi
import app.fivvi.api.apis.MeApi
import app.fivvi.api.apis.SignInApi
import app.fivvi.pro.auth.InMemorySessionStore
import app.fivvi.pro.auth.Session
import app.fivvi.pro.home.FakeMeApi
import app.fivvi.pro.signin.FakeSignInApi
import java.util.Locale
import org.junit.rules.ExternalResource

/**
 * Starts [MainActivity] with fake API clients and fake OS language settings, and puts the real ones back after. The
 * session defaults to a signed-in one (the home, as E008's hello tests expect); pass `Session(InMemorySessionStore())`
 * for an app that starts signed out.
 */
class AppRule : ExternalResource() {
    private val app = ApplicationProvider.getApplicationContext<FivviApplication>()
    private var scenario: ActivityScenario<MainActivity>? = null

    fun launch(
        api: HelloApi,
        device: List<String>,
        perApp: List<String> = emptyList(),
        signInApi: SignInApi = FakeSignInApi(),
        meApi: MeApi = FakeMeApi().apply { answerAccount() },
        session: Session = Session(InMemorySessionStore("token-1")),
        signOutApi: (String) -> SignInApi = { signInApi },
    ) {
        app.dependencies = object : AppDependencies {
            override val helloApi = api
            override val signInApi = signInApi
            override val meApi = meApi
            override val session = session

            override fun signOutApi(token: String) = signOutApi(token)

            override val languageSettings = object : LanguageSettings {
                override val perAppLanguages = perApp.map(Locale::forLanguageTag)
                override val deviceLanguages = device.map(Locale::forLanguageTag)
            }
        }
        scenario = ActivityScenario.launch(MainActivity::class.java)
    }

    /** The generated catalog's text for [id] in [language], with [formatArgs]: what the screen should show. */
    fun string(language: AppLanguage, @StringRes id: Int, vararg formatArgs: Any): String {
        val configuration = Configuration(app.resources.configuration).apply { setLocales(LocaleList(language.locale)) }
        return app.createConfigurationContext(configuration).getString(id, *formatArgs)
    }

    /** Closes the activity, as when the person leaves the app; [launch] starts it again. */
    fun close() {
        scenario?.close()
        scenario = null
    }

    override fun after() {
        close()
        app.dependencies = DefaultAppDependencies(app)
    }
}

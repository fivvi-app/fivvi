package app.fivvi.pro

import androidx.lifecycle.Lifecycle
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import app.fivvi.api.apis.HelloApi
import app.fivvi.api.apis.MeApi
import app.fivvi.api.apis.SignInApi
import app.fivvi.api.apis.WorkspacesApi
import app.fivvi.pro.auth.InMemorySessionStore
import app.fivvi.pro.auth.Session
import app.fivvi.pro.home.FakeMeApi
import app.fivvi.pro.home.FakeWorkspacesApi
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
        workspacesApi: WorkspacesApi = FakeWorkspacesApi(),
        session: Session = Session(InMemorySessionStore("token-1")),
        signOutApi: (String) -> SignInApi = { signInApi },
    ) {
        app.dependencies = object : AppDependencies {
            override val helloApi = api
            override val signInApi = signInApi
            override val meApi = meApi
            override val workspacesApi = workspacesApi
            override val session = session

            override fun signOutApi(token: String) = signOutApi(token)

            override val languageSettings = object : LanguageSettings {
                override val perAppLanguages = perApp.map(Locale::forLanguageTag)
                override val deviceLanguages = device.map(Locale::forLanguageTag)
            }
        }
        scenario = ActivityScenario.launch(MainActivity::class.java)
    }

    /** The system's back, as the gesture or button sends it to the activity. */
    fun pressBack() {
        scenario?.onActivity { it.onBackPressedDispatcher.onBackPressed() }
    }

    /** The person leaves the app and comes back: the activity is stopped, then started again. */
    fun backgroundAndForeground() {
        scenario?.moveToState(Lifecycle.State.CREATED)
        scenario?.moveToState(Lifecycle.State.RESUMED)
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

package app.fivvi.client

import androidx.lifecycle.Lifecycle
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import app.fivvi.api.apis.MeApi
import app.fivvi.api.apis.SignInApi
import app.fivvi.api.models.MeResponse
import app.fivvi.core.AppLanguage
import app.fivvi.core.FakeLanguageSettings
import app.fivvi.core.InMemoryLanguageStore
import app.fivvi.core.LanguagePreference
import app.fivvi.core.LanguageSettings
import app.fivvi.core.LanguageStore
import app.fivvi.core.auth.InMemorySessionStore
import app.fivvi.core.auth.Session
import app.fivvi.core.me.FakeMeApi
import app.fivvi.core.signin.FakeSignInApi
import org.junit.rules.ExternalResource

/**
 * Starts [MainActivity] with fake API clients and fake OS language settings, and puts the real ones back after. The
 * session defaults to a signed-in one (the tabs); pass `Session(InMemorySessionStore())` for an app that starts signed out.
 */
class ClientAppRule : ExternalResource() {
    private val app = ApplicationProvider.getApplicationContext<ClientApplication>()
    private var scenario: ActivityScenario<MainActivity>? = null

    fun launch(
        device: List<String>,
        perApp: List<String> = emptyList(),
        signInApi: SignInApi = FakeSignInApi(),
        meApi: MeApi = FakeMeApi().apply { answerAccount(workspaces = emptyList()) },
        session: Session = Session(InMemorySessionStore("token-1")),
        signOutApi: (String) -> SignInApi = { signInApi },
        languageStore: LanguageStore = InMemoryLanguageStore(),
        languageSettings: FakeLanguageSettings = FakeLanguageSettings(perApp, device),
        connectivity: Connectivity = FakeConnectivity(),
    ) {
        // The account stores the language of the phone, so the stored preference changes nothing unless a test says so.
        (meApi as? FakeMeApi)?.defaultPreferredLocale = storedOf(perApp + device)
        app.dependencies = object : ClientDependencies {
            override val signInApi = signInApi
            override val meApi = meApi
            override val session = session

            override fun signOutApi(token: String) = signOutApi(token)

            override val languageSettings: LanguageSettings = languageSettings
            override val languagePreference = LanguagePreference(languageStore, languageSettings)
            override val connectivity = connectivity
        }
        scenario = ActivityScenario.launch(MainActivity::class.java)
    }

    /** The person leaves the app and comes back: the activity is stopped, then started again. */
    fun backgroundAndForeground() {
        scenario?.moveToState(Lifecycle.State.CREATED)
        scenario?.moveToState(Lifecycle.State.RESUMED)
    }

    override fun after() {
        scenario?.close()
        scenario = null
        app.dependencies = DefaultClientDependencies(app)
    }
}

// The stored preference that matches the first supported language in [tags]: English when none is.
private fun storedOf(tags: List<String>) =
    if (AppLanguage.resolve(emptyList(), tags.map(java.util.Locale::forLanguageTag)) == AppLanguage.DUTCH) {
        MeResponse.PreferredLocale.NL_NL
    } else {
        MeResponse.PreferredLocale.EN
    }

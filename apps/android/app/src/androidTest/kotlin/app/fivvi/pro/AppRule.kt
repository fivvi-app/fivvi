package app.fivvi.pro

import android.os.SystemClock
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.lifecycle.Lifecycle
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import app.fivvi.api.apis.ClientsApi
import app.fivvi.api.apis.HelloApi
import app.fivvi.api.apis.MeApi
import app.fivvi.api.apis.SignInApi
import app.fivvi.api.apis.TrainersApi
import app.fivvi.api.apis.WorkspacesApi
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
import app.fivvi.pro.clients.FakeClientsApi
import app.fivvi.pro.home.FakeTrainersApi
import app.fivvi.pro.home.FakeWorkspacesApi
import app.fivvi.pro.workspace.CurrentWorkspace
import app.fivvi.pro.workspace.InMemoryLastWorkspaceStore
import app.fivvi.pro.workspace.LastWorkspaceStore
import org.junit.rules.ExternalResource

/**
 * Starts [MainActivity] with fake API clients and fake OS language settings, and puts the real ones back after. The
 * session defaults to a signed-in one (the home, as E008's hello tests expect); pass `Session(InMemorySessionStore())`
 * for an app that starts signed out. [lastWorkspace] is the device's memory of the workspace used last; pass the same one
 * to a second launch to keep it across a restart.
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
        clientsApi: ClientsApi = FakeClientsApi(),
        trainersApi: TrainersApi = FakeTrainersApi(),
        session: Session = Session(InMemorySessionStore("token-1")),
        signOutApi: (String) -> SignInApi = { signInApi },
        languageStore: LanguageStore = InMemoryLanguageStore(),
        languageSettings: FakeLanguageSettings = FakeLanguageSettings(perApp, device),
        lastWorkspace: LastWorkspaceStore = InMemoryLastWorkspaceStore(),
    ) {
        // The account stores the language of the phone, so the stored preference changes nothing unless a test says so.
        (meApi as? FakeMeApi)?.defaultPreferredLocale = storedOf(perApp + device)
        app.dependencies = object : AppDependencies {
            override val helloApi = api
            override val signInApi = signInApi
            override val meApi = meApi
            override val workspacesApi = workspacesApi
            override val clientsApi = clientsApi
            override val trainersApi = trainersApi
            override val session = session

            override fun signOutApi(token: String) = signOutApi(token)

            override val languageSettings: LanguageSettings = languageSettings
            override val languagePreference = LanguagePreference(languageStore, languageSettings)
            override val currentWorkspace = CurrentWorkspace(lastWorkspace)
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

    /**
     * Hides the soft keyboard and returns once it is gone and has stayed gone for a few polls. Typing into a field shows
     * it, and each change of focus hides and shows it again: the insets animation (`imePadding`) runs outside Compose's
     * idling, so a tap right after typing meets a layout that is still moving (#569). A test that goes on to a control
     * below the fields calls this first.
     */
    fun hideKeyboard(timeoutMillis: Long = KEYBOARD_TIMEOUT_MILLIS) {
        val deadline = SystemClock.uptimeMillis() + timeoutMillis
        var gonePolls = 0
        while (gonePolls < KEYBOARD_GONE_POLLS) {
            var bottom = 0
            scenario?.onActivity { activity ->
                val decor = activity.window.decorView
                val ime = WindowInsetsCompat.Type.ime()
                if (ViewCompat.getRootWindowInsets(decor)?.isVisible(ime) == true) {
                    WindowCompat.getInsetsController(activity.window, decor).hide(ime)
                }
                bottom = ViewCompat.getRootWindowInsets(decor)?.getInsets(ime)?.bottom ?: 0
            }
            gonePolls = if (bottom == 0) gonePolls + 1 else 0
            check(SystemClock.uptimeMillis() < deadline) { "the soft keyboard did not go away in ${timeoutMillis}ms" }
            Thread.sleep(KEYBOARD_POLL_MILLIS)
        }
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

// The stored preference that matches the first supported language in [tags]: English when none is.
private fun storedOf(tags: List<String>) =
    if (AppLanguage.resolve(emptyList(), tags.map(java.util.Locale::forLanguageTag)) == AppLanguage.DUTCH) {
        MeResponse.PreferredLocale.NL_NL
    } else {
        MeResponse.PreferredLocale.EN
    }

private const val KEYBOARD_TIMEOUT_MILLIS = 5_000L
private const val KEYBOARD_GONE_POLLS = 5
private const val KEYBOARD_POLL_MILLIS = 50L

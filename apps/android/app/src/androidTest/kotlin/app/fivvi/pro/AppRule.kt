package app.fivvi.pro

import android.os.SystemClock
import androidx.compose.ui.test.junit4.ComposeTestRule
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsAnimationCompat
import androidx.core.view.WindowInsetsCompat
import androidx.lifecycle.Lifecycle
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import app.fivvi.api.apis.ClientsApi
import app.fivvi.api.apis.GroupClassesApi
import app.fivvi.api.apis.LocationsApi
import app.fivvi.api.apis.MeApi
import app.fivvi.api.apis.SessionsApi
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
import app.fivvi.core.net.Connectivity
import app.fivvi.core.net.FakeConnectivity
import app.fivvi.core.signin.FakeSignInApi
import app.fivvi.pro.classes.FakeGroupClassesApi
import app.fivvi.pro.clients.FakeClientsApi
import app.fivvi.pro.home.FakeTrainersApi
import app.fivvi.pro.home.FakeWorkspacesApi
import app.fivvi.pro.personal.MemoryPersonalStore
import app.fivvi.pro.personal.PersonalStore
import app.fivvi.pro.personal.ProTab
import app.fivvi.pro.sessions.FakeLocationsApi
import app.fivvi.pro.sessions.FakeSessionsApi
import app.fivvi.pro.workspace.CurrentWorkspace
import app.fivvi.pro.workspace.InMemoryLastWorkspaceStore
import app.fivvi.pro.workspace.LastWorkspaceStore
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.concurrent.atomic.AtomicInteger
import org.junit.rules.ExternalResource

/**
 * Starts [MainActivity] with fake API clients and fake OS language settings, and puts the real ones back after. The
 * session defaults to a signed-in one (the home); pass `Session(InMemorySessionStore())`
 * for an app that starts signed out. [lastWorkspace] is the device's memory of the workspace used last; pass the same one
 * to a second launch to keep it across a restart. The app opens on [startTab]: the home, which most tests are about, unless
 * a test of Vandaag says so (the app itself opens on Vandaag, F013); [personal] is what Vandaag keeps for its offline view,
 * and [now] fixes the clock the personal screens read.
 */
class AppRule : ExternalResource() {
    private val app = ApplicationProvider.getApplicationContext<FivviApplication>()
    private var scenario: ActivityScenario<MainActivity>? = null

    fun launch(
        device: List<String>,
        perApp: List<String> = emptyList(),
        signInApi: SignInApi = FakeSignInApi(),
        meApi: MeApi = FakeMeApi().apply { answerAccount() },
        workspacesApi: WorkspacesApi = FakeWorkspacesApi(),
        clientsApi: ClientsApi = FakeClientsApi(),
        trainersApi: TrainersApi = FakeTrainersApi(),
        sessionsApi: SessionsApi = FakeSessionsApi(),
        locationsApi: LocationsApi = FakeLocationsApi(),
        groupClassesApi: GroupClassesApi = FakeGroupClassesApi(sessionsApi as? FakeSessionsApi ?: FakeSessionsApi()),
        session: Session = Session(InMemorySessionStore("token-1")),
        signOutApi: (String) -> SignInApi = { signInApi },
        languageStore: LanguageStore = InMemoryLanguageStore(),
        languageSettings: FakeLanguageSettings = FakeLanguageSettings(perApp, device),
        lastWorkspace: LastWorkspaceStore = InMemoryLastWorkspaceStore(),
        startTab: ProTab = ProTab.HOME,
        personal: PersonalStore = MemoryPersonalStore(),
        now: Instant? = null,
        connectivity: Connectivity = FakeConnectivity(),
    ) {
        // The account stores the language of the phone, so the stored preference changes nothing unless a test says so.
        (meApi as? FakeMeApi)?.defaultPreferredLocale = storedOf(perApp + device)
        app.dependencies = object : AppDependencies {
            override val signInApi = signInApi
            override val meApi = meApi
            override val workspacesApi = workspacesApi
            override val clientsApi = clientsApi
            override val trainersApi = trainersApi
            override val sessionsApi = sessionsApi
            override val locationsApi = locationsApi
            override val groupClassesApi = groupClassesApi
            override val session = session
            override val connectivity = connectivity

            override fun signOutApi(token: String) = signOutApi(token)

            override val languageSettings: LanguageSettings = languageSettings
            override val languagePreference = LanguagePreference(languageStore, languageSettings)
            override val currentWorkspace = CurrentWorkspace(lastWorkspace)
            override val personalStore = personal
            override val initialTab = startTab
            override val clock: Clock = now?.let { Clock.fixed(it, ZoneOffset.UTC) } ?: Clock.systemUTC()
        }
        scenario = ActivityScenario.launch(MainActivity::class.java).also { launched ->
            imeAnimations.set(0)
            imeStarts.set(0)
            imeStartsSeen = 0
            launched.onActivity { activity ->
                ViewCompat.setWindowInsetsAnimationCallback(activity.window.decorView, imeAnimationCounter)
            }
        }
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
     * Hides the soft keyboard and waits until it is gone and its insets animation has ended. Typing shows it, and each
     * change of focus hides and shows it again; `imePadding` follows that animation, which Compose's idling does not
     * track, and the root insets already show the end state when it starts. A test that goes on to a control below the
     * fields calls this first (#569). [launch] has registered the callback that counts the running animations.
     *
     * The keyboard shows a moment after the text input, not with it: right after typing it is not visible and nothing
     * animates yet, and a check that returns then lets the keyboard slide in during the next scroll and click, which
     * lands on the wrong element or misses (#1530). So the call first waits (briefly, a device with a hardware keyboard
     * shows none) for the keyboard to start since the last call, and it is done only when the keyboard has stayed hidden
     * for [KEYBOARD_SETTLE_MILLIS], so a show that follows a hide at a change of focus is not missed either.
     */
    fun hideKeyboard(compose: ComposeTestRule, timeoutMillis: Long = KEYBOARD_TIMEOUT_MILLIS) {
        val running = requireNotNull(scenario) { "hideKeyboard needs a launched activity" }
        fun shown(): Boolean {
            var shown = false
            running.onActivity { activity ->
                val decor = activity.window.decorView
                shown = ViewCompat.getRootWindowInsets(decor)?.isVisible(WindowInsetsCompat.Type.ime()) == true
            }
            return shown
        }
        val deadline = SystemClock.uptimeMillis() + KEYBOARD_SHOW_GRACE_MILLIS
        while (imeStarts.get() == imeStartsSeen && !shown() && SystemClock.uptimeMillis() < deadline) {
            compose.waitForIdle()
            Thread.sleep(KEYBOARD_POLL_MILLIS)
        }
        var hiddenSince = 0L
        compose.waitUntil(timeoutMillis) {
            if (shown()) {
                running.onActivity { activity ->
                    WindowCompat.getInsetsController(activity.window, activity.window.decorView)
                        .hide(WindowInsetsCompat.Type.ime())
                }
            }
            if (shown() || imeAnimations.get() != 0) {
                hiddenSince = 0L
            } else if (hiddenSince == 0L) {
                hiddenSince = SystemClock.uptimeMillis()
            }
            hiddenSince != 0L && SystemClock.uptimeMillis() - hiddenSince >= KEYBOARD_SETTLE_MILLIS
        }
        compose.waitForIdle()
        imeStartsSeen = imeStarts.get()
    }

    // Counts the insets animations of the keyboard that are running and, in imeStarts, that have started: onPrepare comes
    // before the first frame, onEnd after the last one (also when the animation is cancelled). imeStartsSeen is
    // imeStarts at the end of the last hideKeyboard.
    private val imeAnimations = AtomicInteger(0)
    private val imeStarts = AtomicInteger(0)
    private var imeStartsSeen = 0
    private val imeAnimationCounter = object : WindowInsetsAnimationCompat.Callback(DISPATCH_MODE_CONTINUE_ON_SUBTREE) {
        override fun onPrepare(animation: WindowInsetsAnimationCompat) {
            if (!animation.isKeyboard()) return
            imeStarts.incrementAndGet()
            imeAnimations.incrementAndGet()
        }

        override fun onProgress(insets: WindowInsetsCompat, running: List<WindowInsetsAnimationCompat>) = insets

        override fun onEnd(animation: WindowInsetsAnimationCompat) {
            if (animation.isKeyboard()) imeAnimations.decrementAndGet()
        }

        private fun WindowInsetsAnimationCompat.isKeyboard() = typeMask and WindowInsetsCompat.Type.ime() != 0
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
private const val KEYBOARD_SHOW_GRACE_MILLIS = 2_000L
private const val KEYBOARD_SETTLE_MILLIS = 300L
private const val KEYBOARD_POLL_MILLIS = 20L

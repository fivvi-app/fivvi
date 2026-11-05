package app.fivvi.core.observability

import app.fivvi.core.AppLanguage
import app.fivvi.core.appLanguageParameters
import io.sentry.Breadcrumb
import io.sentry.OptionsContainer
import io.sentry.Sentry
import io.sentry.android.core.SentryAndroidOptions
import io.sentry.protocol.User
import java.util.Locale
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// Synthetic values only (AGENTS.md, D8).
private const val EMAIL = "anna@example.com"
private const val NAME = "Anna de Vries"
private const val WORKSPACE_NAME = "John's Gym"
private const val TOKEN = "Bearer test-token"
private const val DSN = "https://public@o0.ingest.de.sentry.io/1"

/**
 * E017 AC10 (#469): every event of an app says which app it comes from (`app`) and on which platform (`platform:
 * android`), and nothing else a tag could carry. Run in nl-NL and en: the error message is in the app's language.
 */
@RunWith(Parameterized::class)
class ObservabilityAppTagTest(@Suppress("UNUSED_PARAMETER") tag: String, private val language: AppLanguage) {
    private var transport: CaptureTransport? = null
    private lateinit var defaultLocale: Locale

    @Before
    fun setUp() {
        defaultLocale = Locale.getDefault()
        Locale.setDefault(language.locale)
    }

    @After
    fun tearDown() {
        Sentry.close()
        Locale.setDefault(defaultLocale)
    }

    private fun start(app: String): Boolean = Observability.start(
        ObservabilityConfig(dsn = DSN, environment = "production", release = "app.fivvi@1.2.3+45", app = app),
    ) { configure ->
        Sentry.init(
            OptionsContainer.create(SentryAndroidOptions::class.java),
            { options ->
                configure.configure(options)
                options.setTransportFactory(CaptureTransport.factory { transport = it })
            },
            true,
        )
    }

    private fun failure() = when (language) {
        AppLanguage.DUTCH -> "Kon het account $EMAIL niet laden"
        AppLanguage.ENGLISH -> "Could not load the account $EMAIL"
    }

    @Test
    fun E017_AC10_fivviEventsCarryTheAppAndThePlatform() {
        assertTrue(start("fivvi"))
        Sentry.setTag("workspace", WORKSPACE_NAME)
        Sentry.setTag("email", EMAIL)

        Observability.captureError(IllegalStateException(failure()))

        val event = checkNotNull(transport).events.single()
        assertEquals(mapOf("app" to "fivvi", "platform" to "android"), event.tags)
    }

    @Test
    fun E017_AC10_fivviProEventsNameFivviPro() {
        assertTrue(start("fivvi-pro"))

        Observability.captureError(IllegalStateException(failure()))

        assertEquals(
            mapOf("app" to "fivvi-pro", "platform" to "android"),
            checkNotNull(transport).events.single().tags,
        )
    }

    @Test
    fun E017_AC10_noEmailNameWorkspaceNameOrTokenIsSent() {
        assertTrue(start("fivvi"))
        Sentry.setTag("token", TOKEN)
        Sentry.setTag("workspace", WORKSPACE_NAME)
        Sentry.setExtra("name", NAME)
        Sentry.addBreadcrumb(Breadcrumb("Signed in as $NAME of $WORKSPACE_NAME with $TOKEN"))
        Sentry.setUser(
            User().apply {
                email = EMAIL
                username = NAME
            },
        )

        Observability.captureError(IllegalStateException(failure()))

        val json = checkNotNull(transport).sent
        listOf(EMAIL, NAME, WORKSPACE_NAME, TOKEN, "test-token").forEach {
            assertFalse("'$it' was sent:\n$json", json.contains(it))
        }
    }

    @Test
    fun E017_AC10_tagsSetElsewhereCannotChangeTheAppOrThePlatform() {
        assertTrue(start("fivvi"))
        // Whatever sets these tags on the scope, an event leaves with the ones the build configured.
        Sentry.setTag("app", EMAIL)
        Sentry.setTag("platform", NAME)

        Observability.captureError(IllegalStateException(failure()))

        val event = checkNotNull(transport).events.single()
        assertEquals(mapOf("app" to "fivvi", "platform" to "android"), event.tags)
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}

package app.fivvi.pro.observability

import app.fivvi.pro.AppLanguage
import app.fivvi.pro.appLanguageParameters
import io.sentry.Breadcrumb
import io.sentry.OptionsContainer
import io.sentry.Sentry
import io.sentry.SentryEvent
import io.sentry.SentryLevel
import io.sentry.android.core.SentryAndroidOptions
import io.sentry.protocol.Message
import io.sentry.protocol.Request
import io.sentry.protocol.User
import java.util.Locale
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// Synthetic values only (AGENTS.md, D8). The same ones as the iOS test (ObservabilitySignInTests).
private const val ADDRESS = "owner@example.com"
private const val CODE = "493817"
private const val TOKEN = "bearer-token-0a1b2c3d4e5f"
private const val URL = "https://app.example.com/api/v1/sign-in/token"
private const val DSN = "https://public@o0.ingest.de.sentry.io/1"

/**
 * F001 AC12: what a failed sign-in reports to Sentry, through the production configuration (`Observability.start`, so
 * its `beforeSend` and `beforeBreadcrumb`, as the app starts them) with a capture transport instead of the network.
 */
@RunWith(Parameterized::class)
class ObservabilitySignInTest(@Suppress("UNUSED_PARAMETER") tag: String, private val language: AppLanguage) {
    private val config = ObservabilityConfig(dsn = DSN, environment = "production", release = "app.fivvi.pro@1.2.3+45")
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

    private fun start(): Boolean = Observability.start(config) { configure ->
        Sentry.init(
            OptionsContainer.create(SentryAndroidOptions::class.java),
            { options ->
                configure.configure(options)
                options.setTransportFactory(CaptureTransport.factory { transport = it })
            },
            true,
        )
    }

    private fun failedMessage(address: String) = when (language) {
        AppLanguage.DUTCH -> "Inloggen mislukt voor $address"
        AppLanguage.ENGLISH -> "Sign-in failed for $address"
    }

    /**
     * A failed sign-in call reaches Sentry with neither the email field, the `Authorization` header, the code nor the
     * token: the request keeps its method, path and a few harmless headers; the address is masked in what the error
     * says; the breadcrumbs of the sign-in screen (a tap on the email field, the HTTP calls) keep only the method,
     * status and path.
     */
    @Test
    fun F001N_AC12_scrubsAuthorizationAndCode() {
        assertTrue(start())
        // What the SDK keeps on the scope and what the sign-in screen and its HTTP calls leave behind.
        Sentry.setUser(User().apply { email = ADDRESS })
        Sentry.setExtra("email", ADDRESS)
        Sentry.setExtra("code", CODE)
        Sentry.setTag("token", TOKEN)
        Sentry.addBreadcrumb(tapOnTheEmailField())
        Sentry.addBreadcrumb(refusedCode())
        val kept = mutableListOf<Breadcrumb>()
        Sentry.configureScope { scope -> kept += scope.breadcrumbs }
        assertEquals(listOf(null, null), kept.map { it.message })

        Sentry.captureEvent(failedSignIn())

        val sent = checkNotNull(transport) { "the SDK made no transport" }
        val json = sent.sent
        listOf(ADDRESS, "owner", CODE, TOKEN, "Bearer", "signIn.email").forEach {
            assertFalse("'$it' was sent:\n$json", json.contains(it))
        }
        val event = sent.events.single()
        assertEquals(failedMessage("[email]"), event.message?.formatted)
        assertNull(event.user)
        assertTrue(event.extras.isNullOrEmpty())
        assertNull(event.tags?.get("token"))
        assertEquals("POST", event.request?.method)
        assertEquals(URL, event.request?.url)
        assertEquals(mapOf("content-type" to "application/json"), event.request?.headers)
        assertNull(event.request?.cookies)
        assertNull(event.request?.queryString)
        assertNull(event.request?.data)
        val breadcrumbs = event.breadcrumbs!!
        assertEquals(listOf("ui.click", "http"), breadcrumbs.map { it.category })
        assertEquals(emptyMap<String, Any>(), breadcrumbs.first().data)
        assertEquals(mapOf("method" to "POST", "status_code" to 401, "url" to URL), breadcrumbs.last().data)
    }

    private fun tapOnTheEmailField() = Breadcrumb().apply {
        type = "user"
        category = "ui.click"
        level = SentryLevel.INFO
        message = "signIn.email"
        setData("view.id", "signIn.email")
        setData("view.tag", "signIn.email")
        setData("view.title", ADDRESS)
        setData("text", CODE)
    }

    private fun refusedCode() = Breadcrumb().apply {
        type = "http"
        category = "http"
        setData("method", "POST")
        setData("url", "$URL?code=$CODE")
        setData("status_code", 401)
        setData("request_headers", "Authorization: Bearer $TOKEN")
    }

    private fun failedSignIn() = SentryEvent().apply {
        level = SentryLevel.ERROR
        message = Message().apply {
            formatted = failedMessage(ADDRESS)
            params = listOf(ADDRESS, CODE)
        }
        request = Request().apply {
            method = "POST"
            url = "$URL?email=$ADDRESS&code=$CODE"
            queryString = "email=$ADDRESS&code=$CODE"
            data = mapOf("email" to ADDRESS, "code" to CODE)
            cookies = "session=$TOKEN"
            headers = mapOf(
                "Authorization" to "Bearer $TOKEN",
                "authorization" to "Bearer $TOKEN",
                "Content-Type" to "application/json",
            )
        }
        setExtra("email", ADDRESS)
        setExtra("code", CODE)
        setExtra("token", TOKEN)
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}

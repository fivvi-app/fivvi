package nl.trainerhub.app.observability

import io.sentry.Breadcrumb
import io.sentry.KeyValueCollectionBehavior
import io.sentry.OptionsContainer
import io.sentry.Sentry
import io.sentry.SentryEvent
import io.sentry.SentryLevel
import io.sentry.android.core.SentryAndroidOptions
import io.sentry.protocol.Device
import io.sentry.protocol.Geo
import io.sentry.protocol.Mechanism
import io.sentry.protocol.Message
import io.sentry.protocol.Request
import io.sentry.protocol.Response
import io.sentry.protocol.SentryException
import io.sentry.protocol.SentryRuntime
import io.sentry.protocol.SentryStackFrame
import io.sentry.protocol.SentryStackTrace
import io.sentry.protocol.User
import java.util.Locale
import nl.trainerhub.app.AppLanguage
import nl.trainerhub.app.appLanguageParameters
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// Synthetic personal data only (AGENTS.md, D8). The same values as the iOS tests (#48), so both apps prove the same.
private const val CLIENT_NAME = "Femke de Vries"
private const val EMAIL = "femke@example.com"
private const val IP = "203.0.113.7"
private const val TOKEN = "Bearer test-token"
private const val COOKIE = "session=test-cookie-value"
private const val DEVICE_NAME = "Pixel van Femke"
private const val USER_ID = "0b9c4f2e-5d6a-4c1b-9e8f-1a2b3c4d5e6f"
private const val WORKSPACE_ID = "7d3e2a1b-8c9d-4e0f-a1b2-c3d4e5f6a7b8"
private const val CLIENT_ID = "3f2e1d0c-9b8a-4765-8432-10fedcba9876"
private const val PATH = "/api/v1/clients/$CLIENT_ID/notes"
private const val DSN = "https://public@o0.ingest.de.sentry.io/1"

// E009 AC9 (spec #32): what the app would send to Sentry, through the SDK with a capture transport instead of the
// network. Run in nl-NL and en: the note and the error message are in the app's language.
@RunWith(Parameterized::class)
class ObservabilityTest(@Suppress("UNUSED_PARAMETER") tag: String, private val language: AppLanguage) {
    private val note = when (language) {
        AppLanguage.DUTCH -> "Knieblessure, geen diepe squats"
        AppLanguage.ENGLISH -> "Knee injury, avoid deep squats"
    }
    private val noteWord = note.substringBefore(",")
    private val personal = listOf(
        CLIENT_NAME, "Femke", EMAIL, "femke@", note, noteWord, IP, TOKEN, "test-token", COOKIE, "test-cookie",
    )

    private fun inviteFailed(email: String) = when (language) {
        AppLanguage.DUTCH -> "Kon $email niet uitnodigen voor client $CLIENT_ID"
        AppLanguage.ENGLISH -> "Could not invite $email for client $CLIENT_ID"
    }

    private val config = ObservabilityConfig(
        dsn = DSN,
        environment = "production",
        release = "nl.trainerhub.app@1.2.3+45",
    )
    private var transport: CaptureTransport? = null
    private var options: SentryAndroidOptions? = null
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

    /** Starts reporting as the app does, with the plain JVM SDK and the capture transport instead of the network. */
    private fun start(config: ObservabilityConfig = this.config): Boolean = Observability.start(config) { configure ->
        Sentry.init(
            OptionsContainer.create(SentryAndroidOptions::class.java),
            { options ->
                configure.configure(options)
                options.setTransportFactory(CaptureTransport.factory { transport = it })
                this.options = options
            },
            true,
        )
    }

    private fun sent(): CaptureTransport = checkNotNull(transport) { "the SDK made no transport" }

    @Test
    fun E009_AC9_beforeSendScrubsPersonalData() {
        assertTrue(start())
        Sentry.setUser(personalUser(id = USER_ID, workspaceId = WORKSPACE_ID))
        Sentry.setTag("client_name", CLIENT_NAME)
        Sentry.setExtra("note", note)
        Sentry.addBreadcrumb(Breadcrumb("Saving note for $CLIENT_NAME: $note").apply { category = "console" })
        Sentry.addBreadcrumb(httpBreadcrumb())
        // beforeBreadcrumb scrubs a breadcrumb before the scope keeps it (and, on a phone, stores it for later events).
        val kept = mutableListOf<Breadcrumb>()
        Sentry.configureScope { scope -> kept += scope.breadcrumbs }
        assertEquals(listOf(null, null), kept.map { it.message })
        assertNull(kept.last().data["reason"])

        Sentry.captureEvent(eventWithPersonalData())

        val transport = sent()
        val json = transport.sent
        personal.forEach { assertFalse("'$it' was sent:\n$json", json.contains(it)) }

        val event = transport.events.single()
        assertEquals(inviteFailed("[email]"), event.message?.formatted)
        assertNull(event.message?.params)
        val exception = event.exceptions!!.single()
        assertEquals(inviteFailed("[email]"), exception.value)
        assertEquals("IllegalStateException", exception.type)
        val frame = exception.stacktrace!!.frames!!.single()
        assertEquals(listOf("NoteRepository.kt", "save", 12), listOf(frame.filename, frame.function, frame.lineno))
        assertNull(frame.vars)
        assertEquals(false, exception.mechanism?.isHandled)
        assertNull(exception.mechanism?.data)

        assertEquals(USER_ID, event.user?.id)
        assertEquals(mapOf("organization_id" to WORKSPACE_ID), event.user?.data)
        assertEquals("POST", event.request?.method)
        assertEquals("https://app.example.com$PATH", event.request?.url)
        assertEquals(mapOf("content-type" to "application/json"), event.request?.headers)
        assertEquals(500, event.contexts.response?.statusCode)
        assertEquals("Android", event.contexts.runtime?.name)
        assertEquals("Pixel 9", event.contexts.device?.model)
        assertFalse(event.contexts.containsKey("client"))
        assertNull(event.tags?.get("client_name"))
        assertTrue(event.extras.isNullOrEmpty())

        val breadcrumbs = event.breadcrumbs!!
        assertTrue(breadcrumbs.all { it.message == null })
        val http = breadcrumbs.single { it.type == "http" }
        assertEquals(
            mapOf("method" to "GET", "status_code" to 200, "url" to "https://app.example.com$PATH"),
            http.data,
        )
        assertEquals("production", event.environment)
        assertEquals("nl.trainerhub.app@1.2.3+45", event.release)
    }

    @Test
    fun E009_AC9_keepsOnlyUuidsInTheUser() {
        assertTrue(start())
        Sentry.setUser(personalUser(id = EMAIL, workspaceId = CLIENT_NAME))

        Observability.captureError(IllegalStateException(inviteFailed(EMAIL)))

        val event = sent().events.single()
        assertNull(event.user)
        assertEquals(inviteFailed("[email]"), event.exceptions!!.single().value)
    }

    @Test
    fun E009_AC9_disabledWithoutDsn() {
        var sdkStarted = false
        val started = Observability.start(ObservabilityConfig.fromBuildConfig().copy(dsn = "")) { sdkStarted = true }

        Observability.captureError(IllegalStateException(inviteFailed(EMAIL)))
        Sentry.flush(1_000)

        assertFalse(started)
        assertFalse(sdkStarted)
        assertFalse(Sentry.isEnabled())
        assertNull(transport)
    }

    @Test
    fun E009_AC9_debugBuildReportsAsDevelopment() {
        val debug = ObservabilityConfig.fromBuildConfig()

        assertEquals("development", debug.environment)
        assertTrue(debug.release, Regex("""nl\.trainerhub\.app@\d+\.\d+\.\d+\+\d+""").matches(debug.release))
    }

    @Test
    fun E009_AC9_eventsCarryEnvironmentReleaseAndSessions() {
        assertTrue(start())

        Observability.captureError(IllegalStateException(inviteFailed(EMAIL)))

        val event = sent().events.single()
        assertEquals("production", event.environment)
        assertEquals("nl.trainerhub.app@1.2.3+45", event.release)
        // On a phone the SDK starts and ends sessions with the app's lifecycle; here by hand, to see what is sent.
        assertTrue(checkNotNull(options).isEnableAutoSessionTracking)
        Sentry.startSession()
        Sentry.endSession()
        val session = sent().sessions.last()
        assertTrue(
            session,
            session.contains(""""attrs":{"release":"nl.trainerhub.app@1.2.3+45","environment":"production"}"""),
        )
        val options = checkNotNull(options)
        // The SDK itself collects nothing about the user or requests; the scrubber is the second line.
        val collection = options.dataCollectionResolver
        assertFalse(collection.isUserInfo)
        assertEquals(KeyValueCollectionBehavior.off(), collection.cookies)
        assertEquals(KeyValueCollectionBehavior.off(), collection.httpRequestHeaders)
        assertEquals(KeyValueCollectionBehavior.off(), collection.urlQueryParams)
        assertFalse(collection.isOutgoingRequestBody)
        assertFalse(collection.isIncomingResponseBody)
    }

    // `name` is deprecated, but the SDK still sends it.
    @Suppress("DEPRECATION")
    private fun personalUser(id: String, workspaceId: String) = User().apply {
        this.id = id
        email = EMAIL
        username = CLIENT_NAME
        name = CLIENT_NAME
        ipAddress = IP
        geo = Geo().apply { city = "Amsterdam" }
        data = mapOf("organization_id" to workspaceId, "client_name" to CLIENT_NAME)
    }

    private fun httpBreadcrumb() = Breadcrumb().apply {
        type = "http"
        category = "http"
        setData("url", "https://app.example.com$PATH?email=$EMAIL#$CLIENT_NAME")
        setData("method", "GET")
        setData("status_code", 200)
        setData("http.query", "email=$EMAIL")
        setData("reason", note)
    }

    private fun eventWithPersonalData() = SentryEvent().apply {
        level = SentryLevel.ERROR
        message = Message().apply {
            formatted = inviteFailed(EMAIL)
            params = listOf(EMAIL, CLIENT_NAME)
        }
        exceptions = listOf(
            SentryException().apply {
                type = "IllegalStateException"
                module = "java.lang"
                value = inviteFailed(EMAIL)
                mechanism = Mechanism().apply {
                    type = "UncaughtExceptionHandler"
                    isHandled = false
                    data = mapOf("note" to note)
                }
                stacktrace = SentryStackTrace(
                    listOf(
                        SentryStackFrame().apply {
                            filename = "NoteRepository.kt"
                            function = "save"
                            module = "nl.trainerhub.app.notes.NoteRepository"
                            lineno = 12
                            isInApp = true
                            vars = mapOf("text" to note, "name" to CLIENT_NAME)
                        },
                    ),
                )
            },
        )
        request = Request().apply {
            method = "POST"
            url = "https://app.example.com$PATH?email=$EMAIL#$CLIENT_NAME"
            queryString = "email=$EMAIL&name=$CLIENT_NAME"
            data = mapOf("text" to note, "clientName" to CLIENT_NAME)
            cookies = COOKIE
            headers = mapOf(
                "Authorization" to TOKEN,
                "Cookie" to COOKIE,
                "Content-Type" to "application/json",
                "X-Forwarded-For" to IP,
                "X-Client-Name" to CLIENT_NAME,
            )
            envs = mapOf("REMOTE_ADDR" to IP)
        }
        serverName = DEVICE_NAME
        setExtra("clientName", CLIENT_NAME)
        contexts.setRuntime(SentryRuntime().apply { name = "Android" })
        contexts.setDevice(
            Device().apply {
                model = "Pixel 9"
                name = DEVICE_NAME
            },
        )
        contexts.setResponse(
            Response().apply {
                statusCode = 500
                cookies = COOKIE
                headers = mapOf("set-cookie" to COOKIE)
            },
        )
        contexts.put("client", mapOf("name" to CLIENT_NAME, "note" to note))
        breadcrumbs = listOf(Breadcrumb("Saving note for $CLIENT_NAME: $note").apply { category = "console" })
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}

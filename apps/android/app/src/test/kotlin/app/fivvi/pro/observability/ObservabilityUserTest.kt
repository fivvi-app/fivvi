package app.fivvi.pro.observability

import io.sentry.OptionsContainer
import io.sentry.Sentry
import io.sentry.android.core.SentryAndroidOptions
import io.sentry.protocol.User
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// Synthetic values only (AGENTS.md, D8). The same ones as the iOS test (ObservabilityTests, F001 #266).
private const val ACCOUNT_ID = "0b9c4f2e-5d6a-4c1b-9e8f-1a2b3c4d5e6f"
private const val INSTALLATION_ID = "0123456789abcdef0123456789abcdef"
private const val DSN = "https://public@o0.ingest.de.sentry.io/1"

/**
 * F001 AC2 to AC4 (#266): the Sentry user the app sets once `GET /api/v1/me` has answered and clears on sign-out, seen
 * in what leaves the app through the production configuration (`Observability.start`, so its `beforeSend`), with a
 * capture transport instead of the network.
 */
class ObservabilityUserTest {
    private val config = ObservabilityConfig(dsn = DSN, environment = "production", release = "app.fivvi.pro@1.2.3+45")
    private var transport: CaptureTransport? = null

    @After
    fun tearDown() = Sentry.close()

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

    private fun capture(): String? {
        Observability.captureError(IllegalStateException("Could not load client"))
        return checkNotNull(transport).events.last().user?.id
    }

    @Test
    fun F001N_266_AC2_laterEventsCarryTheAccountId() {
        assertTrue(start())

        Observability.setUser(ACCOUNT_ID)

        assertEquals(ACCOUNT_ID, capture())
        val user = checkNotNull(transport).events.last().user!!
        assertNull(user.email)
        assertNull(user.username)
        assertNull(user.ipAddress)
        assertNull(user.data)
    }

    @Test
    fun F001N_266_AC3_clearingTheUserDropsTheAccountId() {
        assertTrue(start())
        Observability.setUser(ACCOUNT_ID)

        Observability.clearUser()

        // The SDK puts its installation ID back on a phone (DefaultAndroidEventProcessor); the JVM SDK here adds none.
        assertNull(capture())
        assertFalse(checkNotNull(transport).sent.contains(ACCOUNT_ID))
    }

    @Test
    fun F001N_266_AC3_theInstallationIdIsBackAfterSigningOut() {
        assertTrue(start())
        Observability.setUser(ACCOUNT_ID)
        Observability.clearUser()
        // What the SDK's event processor does on a phone once no user is set.
        Sentry.setUser(User().apply { id = INSTALLATION_ID })

        assertEquals(INSTALLATION_ID, capture())
    }

    @Test
    fun F001N_266_AC4_settingAndClearingDoNothingWhileReportingIsOff() {
        val started = Observability.start(config.copy(dsn = "")) { error("the SDK must not start") }

        Observability.setUser(ACCOUNT_ID)
        Observability.clearUser()

        assertFalse(started)
        assertFalse(Sentry.isEnabled())
        assertNull(transport)
    }
}

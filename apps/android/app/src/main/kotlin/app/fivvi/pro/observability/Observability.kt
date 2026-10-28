package app.fivvi.pro.observability

import android.content.Context
import app.fivvi.pro.BuildConfig
import io.sentry.DataCollection
import io.sentry.KeyValueCollectionBehavior
import io.sentry.Sentry
import io.sentry.SentryOptions
import io.sentry.android.core.SentryAndroid
import io.sentry.android.core.SentryAndroidOptions
import io.sentry.protocol.User

/** Where crash reports go and how they are labelled, from the build configuration (OBSERVABILITY.md §1 "Android"). */
data class ObservabilityConfig(val dsn: String, val environment: String, val release: String) {
    companion object {
        fun fromBuildConfig() = ObservabilityConfig(
            dsn = BuildConfig.SENTRY_DSN,
            environment = BuildConfig.SENTRY_ENVIRONMENT,
            release = "${BuildConfig.APPLICATION_ID}@${BuildConfig.VERSION_NAME}+${BuildConfig.VERSION_CODE}",
        )
    }
}

/**
 * Crash and error reporting to Sentry (E009, ADR-013). The only code that calls the Sentry SDK: ktlint's
 * `fivvi:no-sentry-outside-observability` fails anywhere else. Errors and crash-free sessions only: no tracing,
 * profiling, session replay, screenshots or view hierarchy, and no analytics SDK.
 */
object Observability {
    /** Starts reporting unless the build has no DSN; then the SDK isn't started at all. True when it started. */
    fun start(context: Context, config: ObservabilityConfig = ObservabilityConfig.fromBuildConfig()): Boolean =
        start(config) { configuration -> SentryAndroid.init(context, configuration) }

    /** [init] starts the SDK with the configuration it is given: SentryAndroid in the app, the JVM SDK in tests. */
    internal fun start(
        config: ObservabilityConfig,
        init: (Sentry.OptionsConfiguration<SentryAndroidOptions>) -> Unit,
    ): Boolean {
        if (config.dsn.isBlank()) return false
        init { options -> configure(options, config) }
        return true
    }

    /** Reports an error the app caught. Does nothing when reporting is off. */
    fun captureError(error: Throwable) {
        Sentry.captureException(error)
    }

    /**
     * Sets the signed-in account's ID (the UUID `GET /api/v1/me` answers with) as the user of later events and
     * sessions. Never an email address or a name; the scrubber drops anything but a UUID. Does nothing when reporting
     * is off.
     */
    fun setUser(accountId: String) {
        if (!Sentry.isEnabled()) return
        Sentry.setUser(User().apply { id = accountId })
    }

    /** Signed out: later events carry the installation ID again, not the previous account's. Does nothing when off. */
    fun clearUser() {
        if (!Sentry.isEnabled()) return
        Sentry.setUser(null)
    }

    private fun configure(options: SentryAndroidOptions, config: ObservabilityConfig) {
        options.dsn = config.dsn
        options.environment = config.environment
        options.release = config.release
        // Crash-free sessions (release health).
        options.isEnableAutoSessionTracking = true
        options.dataCollection = noDataCollection()
        options.isAttachScreenshot = false
        options.isAttachViewHierarchy = false
        options.isSendClientReports = false
        options.beforeSend = SentryOptions.BeforeSendCallback { event, _ -> scrubEvent(event) }
        options.beforeBreadcrumb =
            SentryOptions.BeforeBreadcrumbCallback { breadcrumb, _ -> scrubBreadcrumb(breadcrumb) }
    }

    /**
     * The SDK's own data collection, all off: no user info (so it never adds the IP address), cookies, headers, bodies,
     * query strings, file paths or database queries. The replacement for the deprecated `sendDefaultPii` (off by
     * default); once any option is set, every unset one collects, so all are set. The scrubber is the second line.
     */
    private fun noDataCollection() = DataCollection().apply {
        userInfo = false
        cookies = KeyValueCollectionBehavior.off()
        urlQueryParams = KeyValueCollectionBehavior.off()
        httpBodies = emptySet()
        httpHeaders.request = KeyValueCollectionBehavior.off()
        httpHeaders.response = KeyValueCollectionBehavior.off()
        graphql.document = false
        graphql.variables = false
        databaseQueryData = false
        filePaths = false
    }
}

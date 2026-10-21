// E009 fixture: the observability module, the one place that may call Sentry, which ktlintCheck accepts. Not compiled;
// NoSentryOutsideObservabilityRuleTest reads it.
package app.fivvi.pro.observability

import io.sentry.Sentry
import io.sentry.android.core.SentryAndroidOptions

fun configure(options: SentryAndroidOptions) {
    options.isEnableAutoSessionTracking = true
    io.sentry.Sentry.captureMessage("Started")
    Sentry.flush(1_000)
}

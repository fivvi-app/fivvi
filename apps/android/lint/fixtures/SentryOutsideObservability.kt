// E009 fixture: Sentry called outside the observability module. ktlintCheck must fail on the import and the fully
// qualified call below and name this file and line. Not compiled; NoSentryOutsideObservabilityRuleTest reads it.
package app.fivvi.pro.hello

import io.sentry.Sentry
import app.fivvi.pro.observability.Observability

fun reportFailure(error: Throwable) {
    Sentry.captureException(error)
    io.sentry.Sentry.captureMessage("Greeting failed")
    Observability.captureError(error)
}

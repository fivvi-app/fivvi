package app.fivvi.client

import app.fivvi.core.observability.ObservabilityConfig

/**
 * Where this app's crash reports go and how they are labelled, from its build configuration (OBSERVABILITY.md §1
 * "Android"): the DSN and environment of the build type, the release `<application ID>@<version>+<version code>`, and
 * the app's name, `fivvi`, which every event carries as its `app` tag (E017 AC10). Fivvi reports to the same Sentry
 * project as Fivvi Pro, told apart by that tag.
 */
fun observabilityConfigOfThisBuild() = ObservabilityConfig(
    dsn = BuildConfig.SENTRY_DSN,
    environment = BuildConfig.SENTRY_ENVIRONMENT,
    release = "${BuildConfig.APPLICATION_ID}@${BuildConfig.VERSION_NAME}+${BuildConfig.VERSION_CODE}",
    app = "fivvi",
)

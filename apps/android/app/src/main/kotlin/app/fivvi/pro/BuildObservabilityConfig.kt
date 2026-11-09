package app.fivvi.pro

import app.fivvi.core.observability.ObservabilityConfig

/**
 * Where this app's crash reports go and how they are labelled, from its build configuration (OBSERVABILITY.md §1
 * "Android"): the DSN and environment of the build type, and the release `<application ID>@<version>+<version code>`
 * that `scripts/release-android.sh` also names when it uploads the mapping.
 */
fun observabilityConfigOfThisBuild() = ObservabilityConfig(
    dsn = BuildConfig.SENTRY_DSN,
    environment = BuildConfig.SENTRY_ENVIRONMENT,
    release = "${BuildConfig.APPLICATION_ID}@${BuildConfig.VERSION_NAME}+${BuildConfig.VERSION_CODE}",
    app = "fivvi-pro",
)

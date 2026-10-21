plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

// API base URL per build type (spec #34), from gradle.properties or -P. Release must be HTTPS.
val debugApiBaseUrl = providers.gradleProperty("fivvi.apiBaseUrl").get()
val releaseApiBaseUrl = providers.gradleProperty("fivvi.releaseApiBaseUrl").getOrElse("")

// Sentry DSN per build type (E009, OBSERVABILITY.md §1 "Android"), from gradle.properties or -P. Empty means no crash
// reporting: the SDK isn't even started.
val debugSentryDsn = providers.gradleProperty("fivvi.sentryDsn").getOrElse("")
val releaseSentryDsn = providers.gradleProperty("fivvi.releaseSentryDsn").getOrElse("")

android {
    namespace = "app.fivvi.pro"
    compileSdk = 37
    buildToolsVersion = "37.0.0"

    defaultConfig {
        applicationId = "app.fivvi.pro"
        minSdk = 26
        targetSdk = 37
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        debug {
            buildConfigField("String", "API_BASE_URL", "\"$debugApiBaseUrl\"")
            buildConfigField("String", "SENTRY_DSN", "\"$debugSentryDsn\"")
            buildConfigField("String", "SENTRY_ENVIRONMENT", "\"development\"")
        }
        release {
            buildConfigField("String", "API_BASE_URL", "\"$releaseApiBaseUrl\"")
            buildConfigField("String", "SENTRY_DSN", "\"$releaseSentryDsn\"")
            buildConfigField("String", "SENTRY_ENVIRONMENT", "\"production\"")
        }
    }

    buildFeatures {
        buildConfig = true
        compose = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    // Strings come only from packages/i18n (generated, never copied): values/ is nl-NL, values-en/ English.
    sourceSets.getByName("main").res.directories.add(rootDir.resolve("../../packages/i18n/generated/android").path)
    // The fake API client, shared by the unit and the instrumented tests.
    sourceSets.getByName("test").kotlin.directories.add("src/testShared/kotlin")
    sourceSets.getByName("androidTest").kotlin.directories.add("src/testShared/kotlin")
    androidResources {
        localeFilters += listOf("nl", "en")
    }

    testOptions {
        animationsDisabled = true
    }
}

val checkReleaseApiBaseUrl = tasks.register("checkReleaseApiBaseUrl") {
    description = "Fails a release build without an HTTPS fivvi.releaseApiBaseUrl."
    val url = releaseApiBaseUrl
    doLast {
        check(url.startsWith("https://")) {
            "Set fivvi.releaseApiBaseUrl (apps/android/gradle.properties) to the production API URL over HTTPS"
        }
    }
}
tasks.matching { it.name == "preReleaseBuild" }.configureEach { dependsOn(checkReleaseApiBaseUrl) }

// E009 (#85): release builds report to the Sentry project `android` in the EU region, so the DSN's host must be
// `<org>.ingest.de.sentry.io`. Runs before every release build and in `pnpm test:android`.
val checkReleaseSentryDsn = tasks.register("checkReleaseSentryDsn") {
    description = "Fails unless fivvi.releaseSentryDsn is an EU-region Sentry DSN."
    val dsn = releaseSentryDsn
    doLast {
        check(Regex("""https://[^@/]+@[a-z0-9]+\.ingest\.de\.sentry\.io/[0-9]+""").matches(dsn)) {
            "Set fivvi.releaseSentryDsn (apps/android/gradle.properties) to the DSN of the Sentry project " +
                "`android`, https://<key>@<org>.ingest.de.sentry.io/<project> (EU region): '$dsn'"
        }
    }
}
tasks.matching { it.name == "preReleaseBuild" }.configureEach { dependsOn(checkReleaseSentryDsn) }

// E009 (spec #32): no product analytics SDK in the app, product events are captured server-side; of Sentry only the SDK
// library, without session replay or the NDK. Checks every library the release build ships, before every build.
val forbiddenLibraries = listOf(
    "com.posthog:",
    "com.google.firebase:firebase-analytics",
    "com.amplitude:",
    "com.mixpanel.android:",
    "com.segment.analytics.",
    "io.sentry:sentry-android-replay",
    "io.sentry:sentry-android-ndk",
)
val checkNoAnalyticsSdk = tasks.register("checkNoAnalyticsSdk") {
    description = "Fails when the release build ships an analytics SDK or Sentry's replay or NDK module."
    val shipped = configurations.named("releaseRuntimeClasspath")
        .flatMap { it.incoming.resolutionResult.rootComponent }
        .map { root ->
            val seen = mutableSetOf<ResolvedComponentResult>()
            val queue = ArrayDeque(listOf(root))
            while (queue.isNotEmpty()) {
                val component = queue.removeFirst()
                if (seen.add(component)) {
                    queue += component.dependencies.filterIsInstance<ResolvedDependencyResult>().map { it.selected }
                }
            }
            seen.mapNotNull { (it.id as? ModuleComponentIdentifier)?.let { id -> "${id.group}:${id.module}" } }
        }
    val forbidden = forbiddenLibraries
    inputs.property("shipped", shipped)
    doLast {
        val found = shipped.get().filter { library -> forbidden.any { library.startsWith(it) } }
        check(found.isEmpty()) { "The app must not ship these libraries (OBSERVABILITY.md §1 \"Android\"): $found" }
    }
}
tasks.matching { it.name == "preBuild" }.configureEach { dependsOn(checkNoAnalyticsSdk) }

dependencies {
    implementation(project(":api"))
    implementation(project(":design-tokens"))
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.material3)
    implementation(libs.compose.ui)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.sentry.android.core)
    debugImplementation(libs.compose.ui.test.manifest)

    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)

    androidTestImplementation(platform(libs.compose.bom))
    androidTestImplementation(libs.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.androidx.test.ext.junit)
}

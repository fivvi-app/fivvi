// Fivvi, the client app (E017, #469): application ID `app.fivvi`, built on :core with the generated API client, strings
// and design tokens, like Fivvi Pro in :app. The version, the base URL and Sentry DSN per build type and the release
// checks are shared with :app (gradle/app-build.gradle.kts, applied by the root build.gradle.kts). Release signing and
// the store lane come with the release-lane ticket (#469).
plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

val appVersion = extra["fivvi.versionName"] as String
val buildNumber = extra["fivvi.versionCode"] as Int
val debugApiBaseUrl = extra["fivvi.debugApiBaseUrl"] as String
val releaseApiBaseUrl = extra["fivvi.releaseApiBaseUrl"] as String
val debugSentryDsn = extra["fivvi.debugSentryDsn"] as String
val releaseSentryDsn = extra["fivvi.releaseSentryDsn"] as String

android {
    namespace = "app.fivvi.client"
    compileSdk = 37
    buildToolsVersion = "37.0.0"

    defaultConfig {
        applicationId = "app.fivvi"
        minSdk = 26
        targetSdk = 37
        versionCode = buildNumber
        versionName = appVersion
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

    // The strings (packages/i18n, generated) live in :core, with everything both apps share. The fake API clients and
    // stores, shared by the unit and the instrumented tests: the app's own and :core's.
    val sharedFakes = listOf("src/testShared/kotlin", "../core/src/testShared/kotlin")
    sourceSets.getByName("test").kotlin.directories.addAll(sharedFakes)
    sourceSets.getByName("androidTest").kotlin.directories.addAll(sharedFakes)
    androidResources {
        localeFilters += listOf("nl", "en")
    }

    testOptions {
        animationsDisabled = true
        unitTests.all { test ->
            // BuildInfoTest compares the build with a run's -Pfivvi.buildNumber, and reads this file.
            providers.gradleProperty("fivvi.buildNumber").orNull?.let { test.systemProperty("fivvi.buildNumber", it) }
            test.inputs.files("../../Version.xcconfig")
        }
    }
}

dependencies {
    implementation(project(":core"))
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.material3)
    implementation(libs.compose.ui)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    debugImplementation(libs.compose.ui.test.manifest)

    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)

    androidTestImplementation(platform(libs.compose.bom))
    androidTestImplementation(libs.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.androidx.test.ext.junit)
}

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

// The version, the build number, the base URL and Sentry DSN per build type and the release checks are the ones of both
// apps (gradle/app-build.gradle.kts, applied by the root build.gradle.kts, so these values exist before this script runs).
val appVersion = extra["fivvi.versionName"] as String
val buildNumber = extra["fivvi.versionCode"] as Int
val debugApiBaseUrl = extra["fivvi.debugApiBaseUrl"] as String
val releaseApiBaseUrl = extra["fivvi.releaseApiBaseUrl"] as String
val debugSentryDsn = extra["fivvi.debugSentryDsn"] as String
val releaseSentryDsn = extra["fivvi.releaseSentryDsn"] as String

// Release signing (E017 #191). The release lane (scripts/release-android.sh) names the upload keystore and its secrets in the
// environment of the build, never on a command line or in a file of the repo: ANDROID_UPLOAD_KEYSTORE_FILE (a path),
// ANDROID_UPLOAD_KEYSTORE_PASSWORD, ANDROID_UPLOAD_KEY_ALIAS and ANDROID_UPLOAD_KEY_PASSWORD. Without a keystore the release
// bundle is left unsigned (debug builds, CI); a keystore without all three others stops the build.
val uploadKeystoreFile = providers.environmentVariable("ANDROID_UPLOAD_KEYSTORE_FILE").orNull
fun uploadSecret(name: String): String {
    val value = providers.environmentVariable(name).orNull?.takeIf { it.isNotEmpty() }
    return value ?: error("ANDROID_UPLOAD_KEYSTORE_FILE is set, so $name must be set too (scripts/release-android.sh)")
}

android {
    namespace = "app.fivvi.pro"
    compileSdk = 37
    buildToolsVersion = "37.0.0"

    defaultConfig {
        applicationId = "app.fivvi.pro"
        minSdk = 26
        targetSdk = 37
        versionCode = buildNumber
        versionName = appVersion
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        if (uploadKeystoreFile != null) {
            create("upload") {
                storeFile = file(uploadKeystoreFile)
                storePassword = uploadSecret("ANDROID_UPLOAD_KEYSTORE_PASSWORD")
                keyAlias = uploadSecret("ANDROID_UPLOAD_KEY_ALIAS")
                keyPassword = uploadSecret("ANDROID_UPLOAD_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        debug {
            buildConfigField("String", "API_BASE_URL", "\"$debugApiBaseUrl\"")
            buildConfigField("String", "SENTRY_DSN", "\"$debugSentryDsn\"")
            buildConfigField("String", "SENTRY_ENVIRONMENT", "\"development\"")
        }
        release {
            signingConfigs.findByName("upload")?.let { signingConfig = it }
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

    // The strings (packages/i18n, generated: values/ is nl-NL, values-en/ English) live in :core, with everything both
    // apps share. The fake API clients, shared by the unit and the instrumented tests: the app's own and :core's.
    val sharedFakes = listOf("src/testShared/kotlin", "../core/src/testShared/kotlin")
    sourceSets.getByName("test").kotlin.directories.addAll(sharedFakes)
    sourceSets.getByName("androidTest").kotlin.directories.addAll(sharedFakes)
    // The filter that leaves the quarantined Compose UI tests out, or runs only them (E002 #1363, scripts/_android.sh).
    sourceSets.getByName("androidTest").kotlin.directories.add("../core/src/androidTestShared/kotlin")
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
    androidTestImplementation(libs.compose.ui.test.junit4.accessibility)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.androidx.test.ext.junit)
    androidTestImplementation(libs.sentry.android.core)
}

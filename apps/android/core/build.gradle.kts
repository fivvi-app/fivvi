// The code both Android apps (Fivvi Pro and, later, Fivvi) need (E017): the sign-in flow, the session, the language, the
// theme, the shared UI states, observability and the generated string resources. No application ID, icon or label here:
// each app module owns its manifest and build identity.
plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "app.fivvi.core"
    compileSdk = 37
    buildToolsVersion = "37.0.0"

    defaultConfig {
        minSdk = 26
    }

    buildFeatures {
        compose = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

// Strings come only from packages/i18n (generated, never copied): values/ is nl-NL, values-en/ English. Through the
// variant API, as in :design-tokens: the library's `sourceSets` DSL fails in AGP 9 with a class cast.
androidComponents {
    onVariants { variant ->
        variant.sources.res?.addStaticSourceDirectory(
            rootDir.resolve("../../packages/i18n/generated/android").path,
        )
        // The fake API client and the in-memory stores, shared by the unit tests here and the tests of the apps.
        variant.hostTests["UnitTest"]?.sources?.kotlin?.addStaticSourceDirectory("src/testShared/kotlin")
    }
}

dependencies {
    api(project(":api"))
    api(project(":design-tokens"))
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.material3)
    implementation(libs.compose.ui)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.sentry.android.core)

    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
}

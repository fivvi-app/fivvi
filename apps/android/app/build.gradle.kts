plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

// API base URL per build type (spec #34), from gradle.properties or -P. Release must be HTTPS.
val debugApiBaseUrl = providers.gradleProperty("trainerhub.apiBaseUrl").get()
val releaseApiBaseUrl = providers.gradleProperty("trainerhub.releaseApiBaseUrl").getOrElse("")

android {
    namespace = "nl.trainerhub.app"
    compileSdk = 37
    buildToolsVersion = "37.0.0"

    defaultConfig {
        applicationId = "nl.trainerhub.app"
        minSdk = 26
        targetSdk = 37
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        debug {
            buildConfigField("String", "API_BASE_URL", "\"$debugApiBaseUrl\"")
        }
        release {
            buildConfigField("String", "API_BASE_URL", "\"$releaseApiBaseUrl\"")
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
    description = "Fails a release build without an HTTPS trainerhub.releaseApiBaseUrl."
    val url = releaseApiBaseUrl
    doLast {
        check(url.startsWith("https://")) {
            "Set trainerhub.releaseApiBaseUrl (apps/android/gradle.properties) to the production API URL over HTTPS"
        }
    }
}
tasks.matching { it.name == "preReleaseBuild" }.configureEach { dependsOn(checkReleaseApiBaseUrl) }

dependencies {
    implementation(project(":api"))
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

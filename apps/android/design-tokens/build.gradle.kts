// The Kotlin design tokens generated from packages/design-tokens (E007, ADR-015), compiled in place: the Material 3
// colour schemes, shapes, type styles and layout values. Never edit them here: change the tokens and run
// `pnpm --filter @trainer-hub/design-tokens generate`.
plugins {
    alias(libs.plugins.android.library)
}

android {
    namespace = "nl.trainerhub.designtokens"
    compileSdk = 37
    buildToolsVersion = "37.0.0"

    defaultConfig {
        minSdk = 26
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

// Through the variant API: the library's `sourceSets` DSL fails in AGP 9 with a class cast.
androidComponents {
    onVariants { variant ->
        variant.sources.kotlin?.addStaticSourceDirectory(
            rootDir.resolve("../../packages/design-tokens/kotlin/generated").path,
        )
    }
}

dependencies {
    api(platform(libs.compose.bom))
    api(libs.compose.material3)
}

import org.jetbrains.kotlin.gradle.dsl.JvmTarget

// The Kotlin client generated from the API contract (packages/contract, E018), compiled in place. Never edit it here:
// change the API and run `pnpm generate:contract`.
plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.serialization)
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin {
    compilerOptions { jvmTarget = JvmTarget.JVM_17 }
    sourceSets.main {
        kotlin.srcDir(rootDir.resolve("../../packages/contract/kotlin/generated"))
    }
}

dependencies {
    api(libs.retrofit)
    api(libs.okhttp)
    api(libs.kotlinx.serialization.json)
    implementation(libs.retrofit.converter.kotlinx.serialization)
    implementation(libs.retrofit.converter.scalars)
    implementation(libs.okhttp.logging.interceptor)
}

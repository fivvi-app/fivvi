plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.jvm) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.serialization) apply false
}

// ktlint with the Trainer Hub rules from lint/ (no hard-coded text in Compose). Runs on our own sources only:
// the generated API client is excluded, and the fixtures in lint/fixtures fail on purpose.
val ktlint by configurations.creating

dependencies {
    ktlint(libs.ktlint.cli) {
        attributes { attribute(Bundling.BUNDLING_ATTRIBUTE, objects.named(Bundling.EXTERNAL)) }
    }
    ktlint(project(":lint-rules"))
}

val ktlintSources = listOf("app/src/**/*.kt", "lint/src/**/*.kt", "**/*.kts", "!**/build/**")

tasks.register<JavaExec>("ktlintCheck") {
    group = "verification"
    description = "Checks Kotlin style and hard-coded text with ktlint."
    classpath = ktlint
    mainClass = "com.pinterest.ktlint.Main"
    args = listOf("--relative") + ktlintSources
}

tasks.register<JavaExec>("ktlintFormat") {
    group = "formatting"
    description = "Fixes the Kotlin style issues ktlint can fix."
    classpath = ktlint
    mainClass = "com.pinterest.ktlint.Main"
    jvmArgs("--add-opens=java.base/java.lang=ALL-UNNAMED")
    args = listOf("--relative", "--format") + ktlintSources
}

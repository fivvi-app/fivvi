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

// AC8 (spec #34): the same ktlint, rules and wiring as ktlintCheck must fail on the literal-text fixture, naming its
// file and every line, and accept the resource-text fixture. Runs before ktlintCheck, so the lint step proves its rule.
val ktlintFixtures = tasks.register<JavaExec>("ktlintFixtures") {
    group = "verification"
    description = "Checks that ktlint rejects the hard-coded text in lint/fixtures."
    classpath = ktlint
    mainClass = "com.pinterest.ktlint.Main"
    val report = layout.buildDirectory.file("ktlint/fixtures.txt").get().asFile
    args = listOf("--relative", "--reporter=plain,output=${report.path}", "lint/fixtures/*.kt")
    isIgnoreExitValue = true
    inputs.dir("lint/fixtures")
    outputs.file(report)
    val result = executionResult
    doLast {
        val reported = report.readLines().filter { it.endsWith("(trainer-hub:no-literal-text)") }
        val expected = listOf("11:10", "12:17", "14:14", "16:10").map { "lint/fixtures/LiteralText.kt:$it:" }
        check(result.get().exitValue != 0) { "ktlint passed lint/fixtures/LiteralText.kt" }
        check(reported.map { it.substringBefore(" ") } == expected) {
            "ktlint should report hard-coded text at $expected, reported:\n${reported.joinToString("\n")}"
        }
    }
}

tasks.register<JavaExec>("ktlintCheck") {
    group = "verification"
    description = "Checks Kotlin style and hard-coded text with ktlint."
    dependsOn(ktlintFixtures)
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

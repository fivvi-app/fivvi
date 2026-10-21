plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.android.library) apply false
    alias(libs.plugins.kotlin.jvm) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.serialization) apply false
}

// ktlint with the Fivvi rules from lint/ (no hard-coded text or colours in Compose, Sentry only in
// observability/). Runs on our own sources only: the generated API client is excluded, and the fixtures in
// lint/fixtures fail on purpose.
val ktlint by configurations.creating

dependencies {
    ktlint(libs.ktlint.cli) {
        attributes { attribute(Bundling.BUNDLING_ATTRIBUTE, objects.named(Bundling.EXTERNAL)) }
    }
    ktlint(project(":lint-rules"))
}

val ktlintSources = listOf("app/src/**/*.kt", "lint/src/**/*.kt", "**/*.kts", "!**/build/**")

// AC8 and AC6 (spec #34), E009: the same ktlint, rules and wiring as ktlintCheck must fail on the hard-coded text and
// colour fixtures and on Sentry outside the observability module, naming the file and every line, and accept the other
// fixtures. Runs before ktlintCheck, so the lint step proves its rules.
val ktlintFixtures = tasks.register<JavaExec>("ktlintFixtures") {
    group = "verification"
    description = "Checks that ktlint rejects the hard-coded text, colours and Sentry calls in lint/fixtures."
    classpath = ktlint
    mainClass = "com.pinterest.ktlint.Main"
    val report = layout.buildDirectory.file("ktlint/fixtures.txt").get().asFile
    args = listOf("--relative", "--reporter=plain,output=${report.path}", "lint/fixtures/*.kt")
    isIgnoreExitValue = true
    inputs.dir("lint/fixtures")
    outputs.file(report)
    val result = executionResult
    doLast {
        val expected = mapOf(
            "no-literal-text" to listOf("11:10", "12:17", "14:14", "16:10").map { "LiteralText.kt:$it" },
            "no-colour-literal" to (17..28).zip(listOf(25, 25, 25, 25, 25, 25, 17, 18, 25, 33, 33, 33))
                .map { (line, column) -> "ColourLiteral.kt:$line:$column" },
            "no-sentry-outside-observability" to listOf("5:8", "10:5").map { "SentryOutsideObservability.kt:$it" },
        )
        check(result.get().exitValue != 0) { "ktlint passed lint/fixtures" }
        val lines = report.readLines()
        expected.forEach { (rule, places) ->
            val reported = lines.filter { it.endsWith("(fivvi:$rule)") }
            val wanted = places.map { "lint/fixtures/$it:" }
            check(reported.map { it.substringBefore(" ") } == wanted) {
                "ktlint should report $rule at $wanted, reported:\n${reported.joinToString("\n")}"
            }
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

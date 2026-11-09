// Maven Central through its repo1 host: some TLS-inspecting company proxies block jars on repo.maven.apache.org, which
// mavenCentral() uses. Same repository, same artifacts.
pluginManagement {
    repositories {
        google()
        maven("https://repo1.maven.org/maven2") { name = "MavenCentral" }
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode = RepositoriesMode.FAIL_ON_PROJECT_REPOS
    repositories {
        google()
        maven("https://repo1.maven.org/maven2") { name = "MavenCentral" }
    }
}

rootProject.name = "fivvi"

// Fivvi Pro (app/); Fivvi, the client app (client/); the code both Android apps share (core/); the generated API client (packages/contract/kotlin); the
// generated design tokens (packages/design-tokens/kotlin); the ktlint rules with their fixtures (lint/).
include(":app", ":client", ":core", ":api", ":design-tokens", ":lint-rules")
project(":lint-rules").projectDir = file("lint")

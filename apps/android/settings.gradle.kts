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

// The app; the generated API client (packages/contract/kotlin); the generated design tokens
// (packages/design-tokens/kotlin); the ktlint rules with their fixtures (lint/).
include(":app", ":api", ":design-tokens", ":lint-rules")
project(":lint-rules").projectDir = file("lint")

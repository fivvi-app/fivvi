import org.jetbrains.kotlin.gradle.dsl.JvmTarget

// Trainer Hub's ktlint rules, loaded by ktlintCheck (../build.gradle.kts). fixtures/ holds code that must fail.
plugins {
    alias(libs.plugins.kotlin.jvm)
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin {
    compilerOptions { jvmTarget = JvmTarget.JVM_17 }
}

dependencies {
    compileOnly(libs.ktlint.cli.ruleset.core)
    compileOnly(libs.ktlint.rule.engine.core)
    testImplementation(libs.ktlint.cli.ruleset.core)
    testImplementation(libs.ktlint.rule.engine)
    testImplementation(libs.junit)
    testRuntimeOnly(libs.slf4j.nop)
}

tasks.test {
    inputs.dir("fixtures")
}

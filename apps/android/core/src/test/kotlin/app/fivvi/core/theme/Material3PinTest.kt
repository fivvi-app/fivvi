package app.fivvi.core.theme

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

// E020 AC9: Compose `material3` is pinned to the 1.5 release candidate through the version catalog, and only it: the
// rest of Compose stays on the BOM. The catalog is read as text, so the test fails on the file, not on how Gradle resolves it.
class Material3PinTest {
    private val catalog = File("../gradle/libs.versions.toml").readText()

    private fun versionOf(name: String) = Regex("""^$name\s*=\s*"([^"]+)"""", RegexOption.MULTILINE)
        .find(catalog)?.groupValues?.get(1)

    @Test
    fun E020_AC9_material3IsPinnedToTheReleaseCandidateOfVersion15() {
        val version = versionOf("compose-material3")

        assertNotNull("libs.versions.toml has no `compose-material3` version", version)
        assertTrue("material3 is $version, not 1.5.0-rc…", Regex("""1\.5\.0-rc\d{2}""").matches(version!!))
    }

    @Test
    fun E020_AC9_theLibraryTakesItsVersionFromTheCatalogEntry() {
        val line = catalog.lines().single { it.startsWith("compose-material3 = {") }

        assertTrue(line, line.contains("""module = "androidx.compose.material3:material3""""))
        assertTrue(line, line.contains("""version.ref = "compose-material3""""))
    }

    @Test
    fun E020_AC9_aCommentSaysToTakeTheStableReleaseOnceItShips() {
        val comment = catalog.lines().takeWhile { !it.startsWith("compose-material3 = {") }
            .takeLastWhile { it.startsWith("#") }.joinToString(" ").lowercase()

        assertTrue("no comment above the material3 library: '$comment'", "stable" in comment && "release" in comment)
    }

    @Test
    fun E020_AC9_onlyMaterial3IsOverriddenTheBomStaysTheSourceOfTheRestOfCompose() {
        assertNotNull(versionOf("compose-bom"))
        assertEquals(
            "androidx.compose.ui:ui takes its version from the BOM",
            """compose-ui = { module = "androidx.compose.ui:ui" }""",
            catalog.lines().single { it.startsWith("compose-ui = ") },
        )
        assertEquals(
            "only material3 has a version of its own among the Compose libraries",
            listOf("compose-material3"),
            Regex("""^(compose-[a-z0-9-]+)\s*=\s*"""", RegexOption.MULTILINE).findAll(catalog).map { it.groupValues[1] }
                .filter { it != "compose-bom" }.toList(),
        )
    }
}

package app.fivvi.pro

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

// E017 (spec #169): the version, the build number and the identifiers of the build.
class BuildInfoTest {
    /** The setting `name` of an xcconfig, the file both apps take their version from. */
    private fun setting(file: String, name: String): String =
        Regex("""^\s*$name\s*=\s*(\S+)\s*$""", RegexOption.MULTILINE)
            .find(File(file).readText())?.groupValues?.get(1)
            ?: error("$file has no $name")

    @Test
    fun E017_AC4_bothPlatformsReadTheSameVersion() {
        val shared = setting("../../Version.xcconfig", "MARKETING_VERSION")

        assertEquals(shared, BuildConfig.VERSION_NAME)
        assertTrue("$shared is not <major>.<minor>.<patch>", Regex("""\d+\.\d+\.\d+""").matches(shared))
    }

    // Gradle passes the project property `fivvi.buildNumber` on to the tests when a run sets it, as a release does;
    // without it the build number is the default of Version.xcconfig (1), the one of debug builds and CI.
    @Test
    fun E017_AC4_versionCodeFromProperty() {
        val default = setting("../../Version.xcconfig", "CURRENT_PROJECT_VERSION").toInt()
        val expected = System.getProperty("fivvi.buildNumber")?.toInt() ?: default

        assertEquals(expected, BuildConfig.VERSION_CODE)
    }

    @Test
    fun E017_AC4_buildNumberDefaultsToOne() {
        assertEquals(1, setting("../../Version.xcconfig", "CURRENT_PROJECT_VERSION").toInt())
    }

    @Test
    fun E017_AC8_applicationIdIsTheFinalId() {
        // Final once the first build is uploaded to Google Play. That the README records the same ID is checked by
        // scripts/test/app-ids.test.mjs, not here: a README edit is not an Android change.
        assertEquals("app.fivvi.pro", BuildConfig.APPLICATION_ID)
    }
}

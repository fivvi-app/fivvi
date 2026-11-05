package app.fivvi.pro.observability

import app.fivvi.core.AppLanguage
import app.fivvi.core.appLanguageParameters
import app.fivvi.pro.observabilityConfigOfThisBuild
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// E009 AC9 (spec #32): the app's own configuration of error reporting, from its build. Run in nl-NL and en, as the
// tests of what is sent are (:core, ObservabilityTest).
@RunWith(Parameterized::class)
class ObservabilityConfigTest(
    @Suppress("UNUSED_PARAMETER") tag: String,
    @Suppress("UNUSED_PARAMETER") language: AppLanguage,
) {
    @Test
    fun E009_AC9_debugBuildReportsAsDevelopment() {
        val debug = observabilityConfigOfThisBuild()

        assertEquals("development", debug.environment)
        assertTrue(debug.release, Regex("""app\.fivvi\.pro@\d+\.\d+\.\d+\+\d+""").matches(debug.release))
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}

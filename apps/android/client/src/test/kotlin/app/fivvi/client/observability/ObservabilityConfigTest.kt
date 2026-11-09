package app.fivvi.client.observability

import app.fivvi.client.observabilityConfigOfThisBuild
import app.fivvi.core.AppLanguage
import app.fivvi.core.appLanguageParameters
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// E017 AC10 (#469): the app's own configuration of error reporting, from its build: it names itself `fivvi` and reports as
// `app.fivvi@<version>+<build>`. What is sent (the `app` and `platform` tags, no personal data) is tested in :core
// (ObservabilityAppTagTest). Run in nl-NL and en, as the tests of what is sent are.
@RunWith(Parameterized::class)
class ObservabilityConfigTest(
    @Suppress("UNUSED_PARAMETER") tag: String,
    @Suppress("UNUSED_PARAMETER") language: AppLanguage,
) {
    @Test
    fun E017_AC10_debugBuildReportsAsFivviInDevelopment() {
        val debug = observabilityConfigOfThisBuild()

        assertEquals("fivvi", debug.app)
        assertEquals("development", debug.environment)
        assertTrue(debug.release, Regex("""app\.fivvi@\d+\.\d+\.\d+\+\d+""").matches(debug.release))
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}

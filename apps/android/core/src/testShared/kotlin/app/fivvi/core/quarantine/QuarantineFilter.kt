package app.fivvi.core.quarantine

import org.junit.runner.Description
import org.junit.runner.manipulation.Filter

/**
 * The quarantine list of the Compose UI tests (E002 #1363, quarantine/compose.txt, TESTING.md section 8) as a JUnit filter.
 * [tests] are the listed names, `app.fivvi.pro.home.Class#method` or a class alone. A parameterized test is listed without its
 * parameters: `method` covers `method[nl-NL]` and `method[en]`. With [only] false the filter leaves the listed tests out (the
 * required jobs); with [only] true it runs exactly them (the Quarantine job). No list: every test runs.
 */
class QuarantineFilter(private val only: Boolean, private val tests: List<String>) : Filter() {
    override fun shouldRun(description: Description): Boolean {
        if (tests.isEmpty()) return true
        if (description.isTest) return isListed(description) == only
        // A class or suite runs when one of its tests does.
        return description.children.any { shouldRun(it) }
    }

    override fun describe(): String = "${if (only) "only" else "without"} the quarantined tests"

    private fun isListed(test: Description): Boolean {
        val method = test.methodName.substringBefore('[')
        return tests.any { it == test.className || it == "${test.className}#$method" }
    }
}

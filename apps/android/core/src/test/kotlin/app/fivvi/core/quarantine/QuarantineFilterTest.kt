package app.fivvi.core.quarantine

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.Description

// E002 #1363 AC1: the filter that leaves the quarantined Compose UI tests out of the required jobs and runs only them in the
// Quarantine job.
class QuarantineFilterTest {
    private val klass = "app.fivvi.pro.home.WorkspaceSwitchTest"
    private fun test(method: String) = Description.createTestDescription(klass, method)

    @Test
    fun E002_AC1_withoutAListEveryTestRuns() {
        assertTrue(QuarantineFilter(only = false, tests = emptyList()).shouldRun(test("a")))
        assertTrue(QuarantineFilter(only = true, tests = emptyList()).shouldRun(test("a")))
    }

    @Test
    fun E002_AC1_aListedMethodIsLeftOutAndTheOthersRun() {
        val filter = QuarantineFilter(only = false, tests = listOf("$klass#a"))

        assertFalse(filter.shouldRun(test("a")))
        assertTrue(filter.shouldRun(test("b")))
        assertTrue(filter.shouldRun(test("aa")))
    }

    @Test
    fun E002_AC1_onlyRunsExactlyTheListedMethods() {
        val filter = QuarantineFilter(only = true, tests = listOf("$klass#a"))

        assertTrue(filter.shouldRun(test("a")))
        assertFalse(filter.shouldRun(test("b")))
        assertFalse(filter.shouldRun(test("aa")))
    }

    @Test
    fun E002_AC1_aMethodListedWithoutParametersCoversEveryParameter() {
        val without = QuarantineFilter(only = false, tests = listOf("$klass#a"))
        val only = QuarantineFilter(only = true, tests = listOf("$klass#a"))

        for (parameter in listOf("a[nl-NL]", "a[en]")) {
            assertFalse(without.shouldRun(test(parameter)))
            assertTrue(only.shouldRun(test(parameter)))
        }
        assertTrue(without.shouldRun(test("b[nl-NL]")))
    }

    @Test
    fun E002_AC1_aClassListedAloneCoversAllItsTests() {
        val without = QuarantineFilter(only = false, tests = listOf(klass))
        val only = QuarantineFilter(only = true, tests = listOf(klass))
        val other = Description.createTestDescription("app.fivvi.pro.home.OtherTest", "a")

        assertFalse(without.shouldRun(test("a")))
        assertFalse(without.shouldRun(test("b")))
        assertTrue(without.shouldRun(other))
        assertTrue(only.shouldRun(test("a")))
        assertFalse(only.shouldRun(other))
    }

    @Test
    fun E002_AC1_aClassRunsWhenOneOfItsTestsDoes() {
        val suite = Description.createSuiteDescription(klass).apply {
            addChild(test("a"))
            addChild(test("b"))
        }
        val allListed = Description.createSuiteDescription(klass).apply { addChild(test("a")) }

        assertTrue(QuarantineFilter(only = false, tests = listOf("$klass#a")).shouldRun(suite))
        assertFalse(QuarantineFilter(only = false, tests = listOf("$klass#a")).shouldRun(allListed))
        assertTrue(QuarantineFilter(only = true, tests = listOf("$klass#a")).shouldRun(suite))
        assertFalse(QuarantineFilter(only = true, tests = listOf("$klass#b")).shouldRun(allListed))
    }

    @Test
    fun E002_AC1_itDescribesItself() {
        assertEquals("without the quarantined tests", QuarantineFilter(false, listOf("x")).describe())
        assertEquals("only the quarantined tests", QuarantineFilter(true, listOf("x")).describe())
    }
}

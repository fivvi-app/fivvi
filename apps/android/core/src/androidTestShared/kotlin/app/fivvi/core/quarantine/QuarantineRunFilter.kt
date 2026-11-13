package app.fivvi.core.quarantine

import androidx.test.platform.app.InstrumentationRegistry
import org.junit.runner.Description
import org.junit.runner.manipulation.Filter

/**
 * What the instrumentation runner loads for `-e filter app.fivvi.core.quarantine.QuarantineRunFilter`: scripts/_android.sh
 * passes it with `quarantine` (`only` in the Quarantine job, `exclude` otherwise) and `quarantineTests` (the listed tests,
 * comma separated). Without a list it lets every test run.
 */
class QuarantineRunFilter : Filter() {
    private val filter = InstrumentationRegistry.getArguments().let { arguments ->
        QuarantineFilter(
            only = arguments.getString("quarantine") == "only",
            tests = arguments.getString("quarantineTests").orEmpty().split(',').filter { it.isNotBlank() },
        )
    }

    override fun shouldRun(description: Description): Boolean = filter.shouldRun(description)

    override fun describe(): String = filter.describe()
}

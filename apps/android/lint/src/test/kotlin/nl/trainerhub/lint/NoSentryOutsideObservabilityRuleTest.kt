package nl.trainerhub.lint

import com.pinterest.ktlint.rule.engine.api.Code
import com.pinterest.ktlint.rule.engine.api.KtLintRuleEngine
import com.pinterest.ktlint.rule.engine.api.LintError
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Test

// E009 (spec #32): only the observability module calls the Sentry SDK, as the Biome rule does for TypeScript.
class NoSentryOutsideObservabilityRuleTest {
    private val engine = KtLintRuleEngine(ruleProviders = TrainerHubRuleSetProvider().getRuleProviders())

    private fun lint(fixture: String): List<LintError> {
        val errors = mutableListOf<LintError>()
        engine.lint(Code.fromFile(File("fixtures/$fixture"))) { errors += it }
        return errors.filter { it.ruleId.value == "trainer-hub:no-sentry-outside-observability" }
    }

    @Test
    fun E009_sentryOutsideObservabilityFailsLint() {
        val errors = lint("SentryOutsideObservability.kt")

        assertEquals(listOf(5, 10), errors.map { it.line })
        assertEquals(listOf(8, 5), errors.map { it.col })
        errors.forEach {
            assertEquals(false, it.canBeAutoCorrected)
            assertEquals(
                "Sentry is called only in nl.trainerhub.app.observability: use Observability instead",
                it.detail,
            )
        }
    }

    @Test
    fun E009_sentryInObservabilityPassesLint() {
        assertEquals(emptyList<LintError>(), lint("SentryInObservability.kt"))
    }
}

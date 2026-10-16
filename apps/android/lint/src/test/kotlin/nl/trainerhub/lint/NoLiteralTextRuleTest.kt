package nl.trainerhub.lint

import com.pinterest.ktlint.rule.engine.api.Code
import com.pinterest.ktlint.rule.engine.api.KtLintRuleEngine
import com.pinterest.ktlint.rule.engine.api.LintError
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Test

class NoLiteralTextRuleTest {
    private val engine = KtLintRuleEngine(ruleProviders = TrainerHubRuleSetProvider().getRuleProviders())

    private fun lint(fixture: String): List<LintError> {
        val errors = mutableListOf<LintError>()
        engine.lint(Code.fromFile(File("fixtures/$fixture"))) { errors += it }
        return errors
    }

    @Test
    fun E008_AC8_literalInTextFailsLint() {
        val errors = lint("LiteralText.kt")

        assertEquals(listOf(11, 12, 14, 16), errors.map { it.line })
        assertEquals(listOf(10, 17, 14, 10), errors.map { it.col })
        errors.forEach {
            assertEquals("trainer-hub:no-literal-text", it.ruleId.value)
            assertEquals(false, it.canBeAutoCorrected)
        }
        assertEquals(
            "Hard-coded text in Text(): use stringResource(R.string.…) from packages/i18n",
            errors.first().detail,
        )
    }

    @Test
    fun E008_AC8_resourceTextPassesLint() {
        assertEquals(emptyList<LintError>(), lint("ResourceText.kt"))
    }
}

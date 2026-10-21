package app.fivvi.lint

import com.pinterest.ktlint.rule.engine.api.Code
import com.pinterest.ktlint.rule.engine.api.KtLintRuleEngine
import com.pinterest.ktlint.rule.engine.api.LintError
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Test

class NoColourLiteralRuleTest {
    private val engine = KtLintRuleEngine(ruleProviders = FivviRuleSetProvider().getRuleProviders())

    private fun lint(fixture: String): List<LintError> {
        val errors = mutableListOf<LintError>()
        engine.lint(Code.fromFile(File("fixtures/$fixture"))) { errors += it }
        return errors.filter { it.ruleId.value == "fivvi:no-colour-literal" }
    }

    @Test
    fun E008_AC6_colourLiteralFailsLint() {
        val errors = lint("ColourLiteral.kt")

        assertEquals((17..28).toList(), errors.map { it.line })
        assertEquals(listOf(25, 25, 25, 25, 25, 25, 17, 18, 25, 33, 33, 33), errors.map { it.col })
        errors.forEach { assertEquals(false, it.canBeAutoCorrected) }
        assertEquals(
            "Hard-coded colour Color(…): take it from MaterialTheme.colorScheme or the design tokens " +
                "(app.fivvi.designtokens)",
            errors.first().detail,
        )
        assertEquals(
            "Hard-coded colour Color.Red: take it from MaterialTheme.colorScheme or the design tokens " +
                "(app.fivvi.designtokens)",
            errors[2].detail,
        )
    }

    @Test
    fun E008_AC6_tokenColoursPassLint() {
        assertEquals(emptyList<LintError>(), lint("TokenColours.kt"))
    }

    @Test
    fun E008_AC6_textFixturesHaveNoColours() {
        assertEquals(emptyList<LintError>(), lint("LiteralText.kt") + lint("ResourceText.kt"))
    }
}

package nl.trainerhub.lint

import com.pinterest.ktlint.rule.engine.core.api.AutocorrectDecision
import com.pinterest.ktlint.rule.engine.core.api.ElementType.CALL_EXPRESSION
import com.pinterest.ktlint.rule.engine.core.api.Rule
import com.pinterest.ktlint.rule.engine.core.api.RuleAutocorrectApproveHandler
import com.pinterest.ktlint.rule.engine.core.api.RuleId
import org.jetbrains.kotlin.com.intellij.lang.ASTNode
import org.jetbrains.kotlin.psi.KtCallExpression
import org.jetbrains.kotlin.psi.KtLiteralStringTemplateEntry
import org.jetbrains.kotlin.psi.KtStringTemplateExpression

/**
 * No hard-coded user-facing text in Compose (AGENTS.md, spec #34 AC8): the text of a `Text` or `BasicText`, also inside
 * a `Button`, must come from the generated string resources, not a string literal. Templates without literal text,
 * such as `"$name"`, are allowed.
 */
class NoLiteralTextRule :
    Rule(
        ruleId = RuleId("${TrainerHubRuleSetProvider.RULE_SET_ID}:no-literal-text"),
        about = About(maintainer = "Trainer Hub"),
    ),
    RuleAutocorrectApproveHandler {
    override fun beforeVisitChildNodes(
        node: ASTNode,
        emit: (offset: Int, errorMessage: String, canBeAutoCorrected: Boolean) -> AutocorrectDecision,
    ) {
        if (node.elementType != CALL_EXPRESSION) return
        val call = node.psi as? KtCallExpression ?: return
        val callee = call.calleeExpression?.text ?: return
        if (callee !in TEXT_COMPOSABLES) return
        val text = call.valueArguments.firstOrNull { it.getArgumentName()?.asName?.asString() == "text" }
            ?: call.valueArguments.firstOrNull()?.takeUnless { it.isNamed() }
        val literal = text?.getArgumentExpression() as? KtStringTemplateExpression ?: return
        if (literal.entries.any { it is KtLiteralStringTemplateEntry && it.text.isNotBlank() }) {
            emit(
                literal.textOffset,
                "Hard-coded text in $callee(): use stringResource(R.string.…) from packages/i18n",
                false,
            )
        }
    }

    private companion object {
        val TEXT_COMPOSABLES = setOf("Text", "BasicText")
    }
}

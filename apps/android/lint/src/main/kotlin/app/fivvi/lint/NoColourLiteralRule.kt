package app.fivvi.lint

import com.pinterest.ktlint.rule.engine.core.api.AutocorrectDecision
import com.pinterest.ktlint.rule.engine.core.api.ElementType.CALL_EXPRESSION
import com.pinterest.ktlint.rule.engine.core.api.ElementType.DOT_QUALIFIED_EXPRESSION
import com.pinterest.ktlint.rule.engine.core.api.ElementType.IMPORT_DIRECTIVE
import com.pinterest.ktlint.rule.engine.core.api.ElementType.PACKAGE_DIRECTIVE
import com.pinterest.ktlint.rule.engine.core.api.Rule
import com.pinterest.ktlint.rule.engine.core.api.RuleAutocorrectApproveHandler
import com.pinterest.ktlint.rule.engine.core.api.RuleId
import com.pinterest.ktlint.rule.engine.core.api.parent
import org.jetbrains.kotlin.com.intellij.lang.ASTNode
import org.jetbrains.kotlin.psi.KtCallExpression
import org.jetbrains.kotlin.psi.KtDotQualifiedExpression

/**
 * No hard-coded colours in app code (ADR-015, spec #34 AC6): every colour comes from `MaterialTheme.colorScheme`, which
 * the app fills from the generated design tokens, or from the tokens themselves (`app.fivvi.designtokens`), so it
 * follows light and dark mode. Rejects `Color(…)`, `Color.Red` and the other members of a `Color` (Compose's or
 * `android.graphics.Color`, also `Color.parseColor(…)`), `toColorInt()`, `colorResource(…)` and Material's own colour
 * schemes, dynamic colour included. `Color.Transparent` and `Color.Unspecified` are allowed: they aren't colours.
 * An import alias for `Color` isn't recognised.
 */
class NoColourLiteralRule :
    Rule(
        ruleId = RuleId("${FivviRuleSetProvider.RULE_SET_ID}:no-colour-literal"),
        about = About(maintainer = "Fivvi"),
    ),
    RuleAutocorrectApproveHandler {
    private val reported = mutableSetOf<ASTNode>()

    override fun beforeVisitChildNodes(
        node: ASTNode,
        emit: (offset: Int, errorMessage: String, canBeAutoCorrected: Boolean) -> AutocorrectDecision,
    ) {
        val colour = when (node.elementType) {
            CALL_EXPRESSION -> callColour(node.psi as KtCallExpression)
            DOT_QUALIFIED_EXPRESSION -> memberColour(node.psi as KtDotQualifiedExpression)
            else -> null
        } ?: return
        if (node.isInDirective() || node.isInside(reported)) return
        // A call that is the selector of `a.b.call()` is reported where the whole expression starts.
        val start = node.treeParent?.takeIf { it.elementType == DOT_QUALIFIED_EXPRESSION && it.lastChildNode == node }
        reported += start ?: node
        emit(
            (start ?: node).startOffset,
            "Hard-coded colour $colour: take it from MaterialTheme.colorScheme or the design tokens " +
                "(app.fivvi.designtokens)",
            false,
        )
    }

    private fun callColour(call: KtCallExpression): String? = when (val callee = call.calleeExpression?.text) {
        "Color" -> "Color(…)"
        in COLOUR_CALLS -> "$callee(…)"
        else -> null
    }

    private fun memberColour(expression: KtDotQualifiedExpression): String? {
        if (expression.receiverExpression.text.substringAfterLast('.') != "Color") return null
        val selector = expression.selectorExpression ?: return null
        val member = (selector as? KtCallExpression)?.calleeExpression?.text ?: selector.text
        return "Color.$member".takeUnless { member in NOT_COLOURS }
    }

    private fun ASTNode.isInDirective(): Boolean =
        parent { it.elementType == IMPORT_DIRECTIVE || it.elementType == PACKAGE_DIRECTIVE } != null

    private fun ASTNode.isInside(nodes: Set<ASTNode>): Boolean = parent { it in nodes } != null

    private companion object {
        val COLOUR_CALLS = setOf(
            "toColorInt",
            "colorResource",
            "lightColorScheme",
            "darkColorScheme",
            "dynamicLightColorScheme",
            "dynamicDarkColorScheme",
            "expressiveLightColorScheme",
        )
        val NOT_COLOURS = setOf("Transparent", "Unspecified")
    }
}

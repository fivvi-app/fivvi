package nl.trainerhub.lint

import com.pinterest.ktlint.rule.engine.core.api.AutocorrectDecision
import com.pinterest.ktlint.rule.engine.core.api.ElementType.DOT_QUALIFIED_EXPRESSION
import com.pinterest.ktlint.rule.engine.core.api.ElementType.IMPORT_DIRECTIVE
import com.pinterest.ktlint.rule.engine.core.api.Rule
import com.pinterest.ktlint.rule.engine.core.api.RuleAutocorrectApproveHandler
import com.pinterest.ktlint.rule.engine.core.api.RuleId
import org.jetbrains.kotlin.com.intellij.lang.ASTNode
import org.jetbrains.kotlin.psi.KtDotQualifiedExpression
import org.jetbrains.kotlin.psi.KtFile
import org.jetbrains.kotlin.psi.KtImportDirective

/**
 * Only the observability module calls the Sentry SDK (E009, OBSERVABILITY.md §1 "Android"), as Biome's
 * `noRestrictedImports` does for the `@sentry` packages in TypeScript: the scrubbing and the off-without-DSN rule live in one place.
 * Rejects an `io.sentry` import and a fully qualified `io.sentry.…` call outside `nl.trainerhub.app.observability`.
 */
class NoSentryOutsideObservabilityRule :
    Rule(
        ruleId = RuleId("${TrainerHubRuleSetProvider.RULE_SET_ID}:no-sentry-outside-observability"),
        about = About(maintainer = "Trainer Hub"),
    ),
    RuleAutocorrectApproveHandler {
    override fun beforeVisitChildNodes(
        node: ASTNode,
        emit: (offset: Int, errorMessage: String, canBeAutoCorrected: Boolean) -> AutocorrectDecision,
    ) {
        val sentry = when (node.elementType) {
            IMPORT_DIRECTIVE -> (node.psi as KtImportDirective).importedFqName?.asString()?.isSentry() == true

            // The innermost `io.sentry` of a fully qualified call.
            DOT_QUALIFIED_EXPRESSION -> (node.psi as KtDotQualifiedExpression).text == SENTRY_PACKAGE

            else -> false
        }
        if (!sentry || (node.psi.containingFile as? KtFile)?.packageFqName?.asString() == OBSERVABILITY_PACKAGE) return
        val offset = (node.psi as? KtImportDirective)?.importedReference?.textOffset ?: node.startOffset
        emit(offset, "Sentry is called only in $OBSERVABILITY_PACKAGE: use Observability instead", false)
    }

    private fun String.isSentry() = this == SENTRY_PACKAGE || startsWith("$SENTRY_PACKAGE.")

    private companion object {
        const val SENTRY_PACKAGE = "io.sentry"
        const val OBSERVABILITY_PACKAGE = "nl.trainerhub.app.observability"
    }
}

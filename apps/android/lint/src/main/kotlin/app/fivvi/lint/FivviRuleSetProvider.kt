package app.fivvi.lint

import com.pinterest.ktlint.cli.ruleset.core.api.RuleSetProviderV3
import com.pinterest.ktlint.rule.engine.core.api.RuleProvider
import com.pinterest.ktlint.rule.engine.core.api.RuleSetId

class FivviRuleSetProvider : RuleSetProviderV3(RuleSetId(RULE_SET_ID)) {
    override fun getRuleProviders(): Set<RuleProvider> = setOf(
        RuleProvider { NoLiteralTextRule() },
        RuleProvider { NoColourLiteralRule() },
        RuleProvider { NoSentryOutsideObservabilityRule() },
    )

    companion object {
        const val RULE_SET_ID = "fivvi"
    }
}

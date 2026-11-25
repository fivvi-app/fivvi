package app.fivvi.pro.kit

import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.test.junit4.ComposeTestRule
import androidx.compose.ui.test.junit4.accessibility.enableAccessibilityChecks
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.tryPerformAccessibilityChecks
import com.google.android.apps.common.testing.accessibility.framework.AccessibilityCheckResult.AccessibilityCheckResultType
import com.google.android.apps.common.testing.accessibility.framework.AccessibilityViewCheckResult
import com.google.android.apps.common.testing.accessibility.framework.checks.TextContrastCheck
import com.google.android.apps.common.testing.accessibility.framework.integrations.espresso.AccessibilityValidator
import org.hamcrest.BaseMatcher
import org.hamcrest.Description

private const val RGB = 0xFFFFFF
private const val MIN_SECONDARY_CONTRAST = 3.0

// The one text-contrast result the tokens allow (ADR-032, `native-secondary-text` in packages/design-tokens): the secondary
// text of the native apps in light mode is above 3:1, not 4.5:1. Only a TextContrastCheck result whose foreground colour is
// that colour and whose ratio is at least 3:1 is accepted, and only in light mode (dark is held to 4.5:1); any other colour,
// check or element, or a lower ratio, still fails. The same rule as ClientsLookTest's.
private fun secondaryTextInLightMode(mode: Mode) = object : BaseMatcher<AccessibilityViewCheckResult>() {
    private val grey = mode.tokens.textSecondary.toArgb() and RGB

    override fun matches(actual: Any?): Boolean {
        if (mode.dark || actual !is AccessibilityViewCheckResult) return false
        if (actual.accessibilityHierarchyCheck != TextContrastCheck::class.java) return false
        val metadata = actual.metadata ?: return false
        if (!metadata.containsKey(TextContrastCheck.KEY_FOREGROUND_COLOR)) return false
        if (!metadata.containsKey(TextContrastCheck.KEY_CONTRAST_RATIO)) return false
        return metadata.getInt(TextContrastCheck.KEY_FOREGROUND_COLOR) and RGB == grey &&
            metadata.getDouble(TextContrastCheck.KEY_CONTRAST_RATIO) >= MIN_SECONDARY_CONTRAST
    }

    override fun describeTo(description: Description) {
        description.appendText("a text contrast result of the secondary text colour, at least 3:1, in light mode")
    }
}

/**
 * Runs the accessibility checks of Google's framework (touch target size, speakable text, text contrast and the rest) over
 * what is drawn, in [mode], and fails on a warning or an error.
 */
fun ComposeTestRule.assertAccessible(mode: Mode) {
    enableAccessibilityChecks(
        AccessibilityValidator()
            .setRunChecksFromRootView(true)
            .setThrowExceptionFor(AccessibilityCheckResultType.WARNING)
            .setSuppressingResultMatcher(secondaryTextInLightMode(mode)),
    )
    onRoot().tryPerformAccessibilityChecks()
}

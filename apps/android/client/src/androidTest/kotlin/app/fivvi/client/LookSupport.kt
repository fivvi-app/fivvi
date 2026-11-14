package app.fivvi.client

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PixelMap
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.test.DeviceConfigurationOverride
import androidx.compose.ui.test.Locales
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.ComposeContentTestRule
import androidx.compose.ui.test.junit4.accessibility.enableAccessibilityChecks
import androidx.compose.ui.text.intl.LocaleList
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.test.platform.app.InstrumentationRegistry
import app.fivvi.core.AppLanguage
import app.fivvi.core.theme.FivviTheme
import app.fivvi.designtokens.DarkTokenColors
import app.fivvi.designtokens.LightTokenColors
import app.fivvi.designtokens.TokenColors
import com.google.android.apps.common.testing.accessibility.framework.AccessibilityCheckResult.AccessibilityCheckResultType
import com.google.android.apps.common.testing.accessibility.framework.AccessibilityViewCheckResult
import com.google.android.apps.common.testing.accessibility.framework.checks.TextContrastCheck
import com.google.android.apps.common.testing.accessibility.framework.integrations.espresso.AccessibilityValidator
import com.google.android.apps.common.testing.accessibility.framework.uielement.ViewHierarchyElement
import kotlin.math.abs
import org.hamcrest.BaseMatcher
import org.hamcrest.CoreMatchers.anyOf
import org.hamcrest.Description

// Helpers of the look tests of Fivvi (E020 AC15): a screen on the canvas of one mode, in one language, and a look at the
// pixels it drew. Only tokens are used as expected colours. The same helpers as Fivvi Pro's kit tests.

/** The two modes a screen is checked in, named by the parameters of a test. */
enum class Mode(val dark: Boolean, val tokens: TokenColors) {
    Light(false, LightTokenColors),
    Dark(true, DarkTokenColors),
}

/** Shows [content] in the theme of [mode] on a [width] dp wide canvas, in [language]. */
fun ComposeContentTestRule.showInMode(
    mode: Mode,
    language: AppLanguage,
    width: Dp = 360.dp,
    content: @Composable () -> Unit,
) = setContent {
    DeviceConfigurationOverride(DeviceConfigurationOverride.Locales(LocaleList(language.tag))) {
        FivviTheme(darkTheme = mode.dark) {
            Surface(Modifier.width(width), color = MaterialTheme.colorScheme.background) { Box { content() } }
        }
    }
}

private val density: Float
    get() = InstrumentationRegistry.getInstrumentation().targetContext.resources.displayMetrics.density

fun Dp.px(): Int = (value * density).toInt()

fun SemanticsNodeInteraction.pixels(): PixelMap = captureToImage().toPixelMap()

/** Whether [this] is [other], give or take [tolerance] of each channel (anti-aliasing never matches exactly). */
fun Color.near(other: Color, tolerance: Float = 0.05f): Boolean =
    abs(red - other.red) <= tolerance && abs(green - other.green) <= tolerance && abs(blue - other.blue) <= tolerance

private const val RGB = 0xFFFFFF
private const val MIN_SECONDARY_CONTRAST = 3.0

// The one text-contrast result the tokens allow (ADR-032, `native-secondary-text` in packages/design-tokens): the secondary
// text of the native apps in light mode, `color.text.secondary` (#85858B), is 3.3:1 on the canvas and 3.7:1 on cards, not
// 4.5:1, and the floor the ADR sets is 3:1. Only a TextContrastCheck result whose foreground colour (the result's metadata,
// not its message) is that colour and whose ratio is at least 3:1 is accepted, and only in light mode.
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

// The text of a disabled control (the send button before an address is typed) is exempt from the contrast rule: WCAG 1.4.3 does
// not apply to inactive components. Only a TextContrastCheck result on an element that is not enabled, or sits in one that
// is not (the text node inside a disabled button), is accepted.
private fun textOfADisabledControl() = object : BaseMatcher<AccessibilityViewCheckResult>() {
    override fun matches(actual: Any?): Boolean {
        if (actual !is AccessibilityViewCheckResult) return false
        if (actual.accessibilityHierarchyCheck != TextContrastCheck::class.java) return false
        var element: ViewHierarchyElement? = actual.element
        while (element != null) {
            if (!element.isEnabled) return true
            element = element.parentView
        }
        return false
    }

    override fun describeTo(description: Description) {
        description.appendText("a text contrast result of a disabled control")
    }
}

/**
 * Turns on the accessibility checks of Google's framework (touch target size, speakable text, text contrast and the rest) for
 * the screen shown after this, in [mode]: they run over the whole screen on each action and on `tryPerformAccessibilityChecks`,
 * and fail the test on a warning or an error. The accepted results are the light-mode secondary text colour of ADR-032
 * and the text of a disabled control.
 */
fun ComposeContentTestRule.enableLookAccessibilityChecks(mode: Mode) = enableAccessibilityChecks(
    AccessibilityValidator()
        .setRunChecksFromRootView(true)
        .setThrowExceptionFor(AccessibilityCheckResultType.WARNING)
        .setSuppressingResultMatcher(anyOf(secondaryTextInLightMode(mode), textOfADisabledControl())),
)

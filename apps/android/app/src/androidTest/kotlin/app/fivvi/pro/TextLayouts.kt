package app.fivvi.pro

import android.content.res.Configuration
import android.os.LocaleList as PlatformLocaleList
import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.DeviceConfigurationOverride
import androidx.compose.ui.test.FontScale
import androidx.compose.ui.test.Locales
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.ComposeContentTestRule
import androidx.compose.ui.test.junit4.ComposeTestRule
import androidx.compose.ui.test.then
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.intl.LocaleList
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.test.core.app.ApplicationProvider
import app.fivvi.pro.theme.FivviTheme
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue

// Checks for AC15 (spec #168): at the largest font scale text wraps instead of being cut off, and buttons keep 48 dp.

/** The generated catalog's text for [id] in [language], with [formatArgs]: what a screen in that language shows. */
fun localizedString(language: AppLanguage, @StringRes id: Int, vararg formatArgs: Any): String {
    val app = ApplicationProvider.getApplicationContext<FivviApplication>()
    val configuration = Configuration(app.resources.configuration).apply {
        setLocales(PlatformLocaleList(language.locale))
    }
    return app.createConfigurationContext(configuration).getString(id, *formatArgs)
}

/**
 * Shows [content] in the app theme, in [language], at Android's largest font scale (200%), on a [width] dp wide screen
 * (a small phone's 320 by default) and, when given, [height] dp high.
 */
fun ComposeContentTestRule.showAtLargestFontScale(
    language: AppLanguage,
    width: Dp = 320.dp,
    height: Dp? = null,
    content: @Composable () -> Unit,
) = setContent {
    DeviceConfigurationOverride(
        DeviceConfigurationOverride.FontScale(2f) then
            DeviceConfigurationOverride.Locales(LocaleList(language.tag)),
    ) {
        FivviTheme {
            val size = Modifier.width(width)
            Box(if (height == null) size else size.height(height)) { content() }
        }
    }
}

/** The layout of the text of this node (one `Text`). */
fun SemanticsNodeInteraction.textLayout(): TextLayoutResult {
    val layouts = mutableListOf<TextLayoutResult>()
    fetchSemanticsNode().config[SemanticsActions.GetTextLayoutResult].action!!.invoke(layouts)
    return layouts.single()
}

// Every line shown in full. (didOverflowWidth isn't used: centred text in a wrap-content button reports it while the
// text fits.)
fun TextLayoutResult.assertNotCutOff(what: String) {
    assertFalse("$what: lines cut off", multiParagraph.didExceedMaxLines)
    assertFalse("$what: height cut off", didOverflowHeight)
}

/** The text of the node with [tag] is shown in full: it wraps (when [wraps]) and no line is cut off. */
fun ComposeTestRule.assertWraps(tag: String, wraps: Boolean = false) {
    waitForIdle()
    val layout = onNode(hasTestTag(tag), useUnmergedTree = true).textLayout()
    if (wraps) assertTrue("$tag wraps", layout.lineCount > 1)
    layout.assertNotCutOff(tag)
}

// Waits until the node with [tag] stays where it is, which the soft keyboard's inset animation otherwise changes
// between two measurements.
private fun ComposeTestRule.awaitStablePosition(tag: String) {
    waitForIdle()
    var last = onNode(hasTestTag(tag)).getUnclippedBoundsInRoot()
    var still = 0
    repeat(STABLE_POLLS) {
        Thread.sleep(STABLE_POLL_MILLIS)
        waitForIdle()
        val now = onNode(hasTestTag(tag)).getUnclippedBoundsInRoot()
        still = if (now == last) still + 1 else 0
        if (still == STABLE_READS) return
        last = now
    }
}

private const val STABLE_POLLS = 40
private const val STABLE_READS = 3
private const val STABLE_POLL_MILLIS = 50L

/** The button with [tag]: its label is shown in full, inside the button, and the touch target is at least 48 dp. */
fun ComposeTestRule.assertButtonFits(tag: String) {
    // A field that takes focus opens the soft keyboard, whose inset animation (the OS's, which Compose doesn't wait for)
    // moves the screen: measure after that.
    awaitStablePosition(tag)
    val label = onNode(hasAnyAncestor(hasTestTag(tag)), useUnmergedTree = true)
    label.textLayout().assertNotCutOff("the text of $tag")
    val labelBounds = label.getUnclippedBoundsInRoot()
    val buttonBounds = onNode(hasTestTag(tag)).getUnclippedBoundsInRoot()
    assertTrue(
        "the text of $tag $labelBounds stays inside the button $buttonBounds",
        labelBounds.left >= buttonBounds.left && labelBounds.right <= buttonBounds.right &&
            labelBounds.top >= buttonBounds.top && labelBounds.bottom <= buttonBounds.bottom,
    )
    // The size of the button as laid out, which includes the 48 dp Material gives every touch target. Not the part of it
    // that is on screen: the screen scrolls, and what is scrolled out of view is clipped.
    val height = buttonBounds.bottom - buttonBounds.top
    val width = buttonBounds.right - buttonBounds.left
    assertTrue("$tag is $height high", height >= 48.dp)
    assertTrue("$tag is $width wide", width >= 48.dp)
}

package app.fivvi.pro

import android.content.res.Configuration
import android.os.LocaleList
import androidx.annotation.StringRes
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.ComposeTestRule
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.unit.dp
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue

// Checks for AC15 (spec #168): at the largest font scale text wraps instead of being cut off, and buttons keep 48 dp.

/** The generated catalog's text for [id] in [language], with [formatArgs]: what a screen in that language shows. */
fun localizedString(language: AppLanguage, @StringRes id: Int, vararg formatArgs: Any): String {
    val app = ApplicationProvider.getApplicationContext<FivviApplication>()
    val configuration = Configuration(app.resources.configuration).apply { setLocales(LocaleList(language.locale)) }
    return app.createConfigurationContext(configuration).getString(id, *formatArgs)
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

/** The button with [tag]: its label is shown in full, inside the button, and the touch target is at least 48 dp. */
fun ComposeTestRule.assertButtonFits(tag: String) {
    // A field that takes focus scrolls itself into view: measure after that.
    waitForIdle()
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

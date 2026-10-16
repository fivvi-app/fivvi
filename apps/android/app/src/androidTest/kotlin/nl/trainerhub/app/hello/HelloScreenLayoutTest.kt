package nl.trainerhub.app.hello

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.DeviceConfigurationOverride
import androidx.compose.ui.test.FontScale
import androidx.compose.ui.test.Locales
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.then
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.intl.LocaleList
import androidx.compose.ui.unit.dp
import nl.trainerhub.app.AppLanguage
import nl.trainerhub.app.R
import nl.trainerhub.app.appLanguageParameters
import nl.trainerhub.app.theme.TrainerHubTheme
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// AC7: Android's largest font scale (200%) on a small phone (320dp wide), in each catalog language.
@RunWith(Parameterized::class)
class HelloScreenLayoutTest(@Suppress("UNUSED_PARAMETER") tag: String, private val language: AppLanguage) {
    @get:Rule
    val compose = createComposeRule()

    private fun show(state: HelloState) = compose.setContent {
        DeviceConfigurationOverride(
            DeviceConfigurationOverride.FontScale(2f) then
                DeviceConfigurationOverride.Locales(LocaleList(language.tag)),
        ) {
            TrainerHubTheme {
                Box(Modifier.width(320.dp)) { HelloScreen(state, onRetry = {}) }
            }
        }
    }

    private fun SemanticsNodeInteraction.textLayout(): TextLayoutResult {
        val layouts = mutableListOf<TextLayoutResult>()
        fetchSemanticsNode().config[SemanticsActions.GetTextLayoutResult].action!!.invoke(layouts)
        return layouts.single()
    }

    // Every line shown in full. (didOverflowWidth isn't used: centred text in a wrap-content button reports it while
    // the text fits.)
    private fun TextLayoutResult.assertNotCutOff(what: String) {
        assertFalse("$what: lines cut off", multiParagraph.didExceedMaxLines)
        assertFalse("$what: height cut off", didOverflowHeight)
    }

    @Test
    fun E008_AC7_fontScale200Wraps() {
        show(HelloState.Loaded(R.string.hello_title))

        val greeting = compose.onNodeWithTag(HelloTags.GREETING).textLayout()
        assertTrue("the greeting wraps", greeting.lineCount > 1)
        greeting.assertNotCutOff("the greeting")
    }

    @Test
    fun E008_AC7_errorAndButtonWrapAtFontScale200() {
        show(HelloState.Failed)

        val error = compose.onNodeWithTag(HelloTags.ERROR).textLayout()
        assertTrue("the error wraps", error.lineCount > 1)
        error.assertNotCutOff("the error")
        val label = compose.onNode(hasAnyAncestor(hasTestTag(HelloTags.RETRY)), useUnmergedTree = true)
        label.textLayout().assertNotCutOff("the button text")
        val labelBounds = label.getUnclippedBoundsInRoot()
        val buttonBounds = compose.onNodeWithTag(HelloTags.RETRY).getUnclippedBoundsInRoot()
        assertTrue(
            "the button text $labelBounds stays inside the button $buttonBounds",
            labelBounds.left >= buttonBounds.left && labelBounds.right <= buttonBounds.right &&
                labelBounds.top >= buttonBounds.top && labelBounds.bottom <= buttonBounds.bottom,
        )
    }

    @Test
    fun E008_AC7_retryButtonIsAtLeast48dp() {
        show(HelloState.Failed)

        val touchBounds = compose.onNodeWithTag(HelloTags.RETRY).fetchSemanticsNode().touchBoundsInRoot
        with(compose.density) {
            assertTrue("touch height ${touchBounds.height.toDp()}", touchBounds.height.toDp() >= 48.dp)
            assertTrue("touch width ${touchBounds.width.toDp()}", touchBounds.width.toDp() >= 48.dp)
        }
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}

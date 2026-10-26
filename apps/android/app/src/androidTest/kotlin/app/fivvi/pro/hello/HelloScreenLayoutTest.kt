package app.fivvi.pro.hello

import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.dp
import app.fivvi.pro.AppLanguage
import app.fivvi.pro.R
import app.fivvi.pro.appLanguageParameters
import app.fivvi.pro.assertButtonFits
import app.fivvi.pro.assertNotCutOff
import app.fivvi.pro.showAtLargestFontScale
import app.fivvi.pro.textLayout
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

    private fun show(state: HelloState) = compose.showAtLargestFontScale(language) { HelloScreen(state, onRetry = {}) }

    @Test
    fun E008_AC7_fontScale200Wraps() {
        // The greeting copy is short and may change, so the greeting style gets a catalog sentence too long for one line
        // at 200% on 320dp. The test then proves long greetings wrap and aren't cut off.
        show(HelloState.Loaded(LONG_COPY))

        val greeting = compose.onNodeWithTag(HelloTags.GREETING).textLayout()
        assertTrue("the greeting wraps", greeting.lineCount > 1)
        greeting.assertNotCutOff("the greeting")
    }

    @Test
    fun E008_AC7_fontScale200GreetingNotCutOff() {
        // The real greeting, whatever its length: no line-count check, only that every line is shown in full.
        show(HelloState.Loaded(R.string.hello_title))

        compose.onNodeWithTag(HelloTags.GREETING).textLayout().assertNotCutOff("the greeting")
    }

    @Test
    fun E008_AC7_errorAndButtonWrapAtFontScale200() {
        show(HelloState.Failed)

        val error = compose.onNodeWithTag(HelloTags.ERROR).textLayout()
        assertTrue("the error wraps", error.lineCount > 1)
        error.assertNotCutOff("the error")
        compose.assertButtonFits(HelloTags.RETRY)
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
        // Any catalog string too long for one line at 200% on 320dp; pick another if a catalog change makes it fit on one line.
        private val LONG_COPY = R.string.hello_error

        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}

package app.fivvi.pro.kit

import androidx.compose.foundation.layout.Column
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MotionScheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.DeviceConfigurationOverride
import androidx.compose.ui.test.FontScale
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import app.fivvi.core.AppLanguage
import app.fivvi.core.appLanguageParameters
import app.fivvi.core.theme.FivviFonts
import app.fivvi.core.theme.LocalTokenColors
import app.fivvi.core.theme.numeric
import app.fivvi.designtokens.TokenColors
import app.fivvi.pro.textLayout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// E020 AC10 and AC11 (spec #590), on a phone, in each catalog language: Fivvi Pro's text is Google Sans Flex, it still
// follows the system's font scale, numbers are rounded with tabular digits, and the theme is Material 3 Expressive.
@RunWith(Parameterized::class)
class KitThemeTest(
    @Suppress("UNUSED_PARAMETER") tag: String,
    private val mode: Mode,
    private val language: AppLanguage,
) {
    @get:Rule
    val compose = createComposeRule()

    private fun sizeOf(tag: String): IntSize = compose.onNodeWithTag(tag).textLayout().size

    @Composable
    private fun Sample(tag: String, style: TextStyle, text: String = SAMPLE) =
        Text(text, Modifier.testTag(tag), style = style)

    @OptIn(ExperimentalMaterial3ExpressiveApi::class)
    @Test
    fun E020_AC10_theThemeIsExpressiveAndItsTypeScaleIsGoogleSansFlex() {
        var spring: Any? = null
        var family: FontFamily? = null
        compose.showKit(mode, language) {
            spring = MaterialTheme.motionScheme.defaultSpatialSpec<Float>()
            family = MaterialTheme.typography.bodyLarge.fontFamily
        }
        compose.waitForIdle()

        // Expressive's springs are bouncier than the standard scheme's.
        assertEquals(MotionScheme.expressive().defaultSpatialSpec<Float>(), spring)
        assertNotEquals(MotionScheme.standard().defaultSpatialSpec<Float>(), spring)
        assertEquals(FivviFonts.GoogleSansFlex, family)
    }

    @Test
    fun E020_AC10_theTokenColoursFollowTheModeOfTheTheme() {
        var shown: TokenColors? = null
        compose.showKit(mode, language) { shown = LocalTokenColors.current }
        compose.waitForIdle()

        assertEquals(mode.name, mode.tokens, shown)
    }

    @Test
    fun E020_AC10_textIsDrawnInGoogleSansFlexNotInThePhonesFont() {
        // A font that failed to load falls back to the phone's: the same glyphs, so the same width as Roboto's.
        compose.showKit(mode, language) {
            Column {
                Sample("flex", TextStyle(fontFamily = FivviFonts.GoogleSansFlex))
                Sample("system", TextStyle(fontFamily = FontFamily.SansSerif))
            }
        }

        assertNotEquals("Google Sans Flex is not drawn", sizeOf("system").width, sizeOf("flex").width)
    }

    @Test
    fun E020_AC10_systemFontScalingIsIntactTheTextGrowsWithTheScale() {
        compose.showKit(language = language, width = 2000.dp) {
            Column {
                for (scale in listOf(1f, 2f)) {
                    DeviceConfigurationOverride(DeviceConfigurationOverride.FontScale(scale)) {
                        Sample("body-$scale", MaterialTheme.typography.bodyLarge)
                    }
                }
            }
        }

        val widths = listOf(1f, 2f).map { sizeOf("body-$it").width }
        // Android scales large text less than linearly (16 sp at 200% is about 28 sp), but it scales.
        assertTrue("1.0: ${widths[0]}, 2.0: ${widths[1]}", widths[1] > widths[0] * 1.5)
    }

    @Test
    fun E020_AC11_numbersHaveTabularDigitsSoEveryDigitIsAsWide() {
        compose.showKit(mode, language) {
            Column {
                Sample("ones", MaterialTheme.typography.bodyLarge.numeric(), "1111")
                Sample("zeros", MaterialTheme.typography.bodyLarge.numeric(), "0000")
                Sample("plain-ones", MaterialTheme.typography.bodyLarge, "1111")
                Sample("plain-zeros", MaterialTheme.typography.bodyLarge, "0000")
            }
        }

        assertEquals("tabular", sizeOf("zeros").width, sizeOf("ones").width)
        // The plain face has proportional digits, so the check above could not pass by accident.
        assertNotEquals("proportional", sizeOf("plain-zeros").width, sizeOf("plain-ones").width)
    }

    companion object {
        private const val SAMPLE = "Fivvi Pro 08:30 Sarah"

        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun modesAndLanguages() = Mode.entries.flatMap { mode ->
            appLanguageParameters().map { arrayOf("${mode.name.lowercase()}-${it[0]}", mode, it[1]) }
        }
    }
}

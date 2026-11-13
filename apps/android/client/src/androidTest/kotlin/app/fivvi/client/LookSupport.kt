package app.fivvi.client

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PixelMap
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.test.DeviceConfigurationOverride
import androidx.compose.ui.test.Locales
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.ComposeContentTestRule
import androidx.compose.ui.text.intl.LocaleList
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.test.platform.app.InstrumentationRegistry
import app.fivvi.core.AppLanguage
import app.fivvi.core.theme.FivviTheme
import app.fivvi.designtokens.DarkTokenColors
import app.fivvi.designtokens.LightTokenColors
import app.fivvi.designtokens.TokenColors
import kotlin.math.abs

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

package app.fivvi.pro.kit

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
import androidx.compose.ui.test.FontScale
import androidx.compose.ui.test.Locales
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.ComposeContentTestRule
import androidx.compose.ui.test.then
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

// Helpers of the kit's tests (E020 AC10, AC11, AC14): the kit on the canvas of one mode, at one font scale and language,
// and a look at the pixels a component drew. Only tokens are used as expected colours.

/** The two modes the kit is checked in, named by the parameters of a test. */
enum class Mode(val dark: Boolean, val tokens: TokenColors) {
    Light(false, LightTokenColors),
    Dark(true, DarkTokenColors),
}

val phone: Dp = 360.dp

/** Shows [content] in the theme of [mode] on a [width] dp wide canvas, in [language], at [fontScale]. */
fun ComposeContentTestRule.showKit(
    mode: Mode = Mode.Light,
    language: AppLanguage = AppLanguage.entries.first(),
    fontScale: Float = 1f,
    width: Dp = phone,
    content: @Composable () -> Unit,
) = setContent {
    DeviceConfigurationOverride(
        DeviceConfigurationOverride.FontScale(fontScale) then
            DeviceConfigurationOverride.Locales(LocaleList(language.tag)),
    ) {
        FivviTheme(darkTheme = mode.dark) {
            Surface(Modifier.width(width), color = MaterialTheme.colorScheme.background) { Box { content() } }
        }
    }
}

val density: Float get() = InstrumentationRegistry.getInstrumentation().targetContext.resources.displayMetrics.density

fun Dp.px(): Int = (value * density).toInt()

fun SemanticsNodeInteraction.pixels(): PixelMap = captureToImage().toPixelMap()

/** Whether [this] is [other], give or take [tolerance] of each channel (a gradient and anti-aliasing never match exactly). */
fun Color.near(other: Color, tolerance: Float = 0.05f): Boolean =
    abs(red - other.red) <= tolerance && abs(green - other.green) <= tolerance && abs(blue - other.blue) <= tolerance

/** Whether the pixel at ([x], [y]) is drawn in [colour]: opaque and near it. Outside a rounded shape it is not. */
fun PixelMap.isFilled(x: Int, y: Int, colour: Color, tolerance: Float = 0.05f): Boolean =
    this[x, y].let { it.alpha > 0.9f && it.near(colour, tolerance) }

fun PixelMap.filledShare(colour: Color, tolerance: Float = 0.05f): Float {
    var filled = 0
    for (y in 0 until height) for (x in 0 until width) if (isFilled(x, y, colour, tolerance)) filled++
    return filled.toFloat() / (width * height)
}

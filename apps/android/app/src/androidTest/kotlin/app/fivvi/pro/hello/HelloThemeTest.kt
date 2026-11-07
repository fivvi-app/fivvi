package app.fivvi.pro.hello

import android.app.UiModeManager
import android.content.Context
import android.os.Build
import androidx.compose.material3.ColorScheme
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PixelMap
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onRoot
import androidx.test.core.app.ApplicationProvider
import androidx.test.filters.SdkSuppress
import app.fivvi.designtokens.DarkColorScheme
import app.fivvi.designtokens.LightColorScheme
import app.fivvi.pro.AppRule
import java.io.IOException
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// AC6 through the real activity: with the app in light or dark mode, the screen shows the colours of the generated
// tokens' Material 3 colour scheme for that mode. The error state shows the canvas, text and the filled retry button.
// The night mode is set for this app only (API 31+; the test emulator runs API 35) and set back to the system's after.
@SdkSuppress(minSdkVersion = Build.VERSION_CODES.S)
@RunWith(Parameterized::class)
class HelloThemeTest(
    @Suppress("UNUSED_PARAMETER") mode: String,
    private val nightMode: Int,
    private val scheme: ColorScheme,
) {
    @get:Rule
    val compose = createEmptyComposeRule()

    @get:Rule
    val app = AppRule()

    private val uiModeManager = ApplicationProvider.getApplicationContext<Context>()
        .getSystemService(UiModeManager::class.java)

    @After
    fun followTheSystemAgain() = uiModeManager.setApplicationNightMode(UiModeManager.MODE_NIGHT_AUTO)

    @Test
    fun E008_AC6_usesTokenColorSchemeInLightAndDark() {
        uiModeManager.setApplicationNightMode(nightMode)
        app.launch(FakeHelloApi().apply { answers += { throw IOException("offline") } }, device = listOf("nl-NL"))

        val error = compose.onNodeWithTag(HelloTags.ERROR).fetchSemanticsNode().boundsInRoot
        val retry = compose.onNodeWithTag(HelloTags.RETRY).fetchSemanticsNode().boundsInRoot
        val label = compose.onNode(hasAnyAncestor(hasTestTag(HelloTags.RETRY)), useUnmergedTree = true)
            .fetchSemanticsNode().boundsInRoot
        val screen = compose.onRoot().captureToImage().toPixelMap()

        assertColour("the screen background", scheme.surface, screen[1, 1])
        // Inside the pill, left of its label.
        assertColour("the retry button", scheme.primary, screen[(retry.left + retry.height / 4).toInt(), retry.centerY])
        assertShows("the error text", scheme.onSurface, screen, error)
        assertShows("the retry label", scheme.onPrimary, screen, label)
    }

    private val Rect.centerY get() = center.y.toInt()

    private fun Color.hex() = "#%08X".format(toArgb())

    private fun assertColour(what: String, expected: Color, actual: Color) =
        assertEquals("$what's colour", expected.hex(), actual.hex())

    // Text is anti-aliased, so only the inside of its glyphs has the exact colour.
    private fun assertShows(what: String, expected: Color, screen: PixelMap, bounds: Rect) {
        val argb = expected.toArgb()
        val pixels = (bounds.left.toInt() until bounds.right.toInt()).asSequence().flatMap { x ->
            (bounds.top.toInt() until bounds.bottom.toInt()).asSequence().map { y -> screen[x, y].toArgb() }
        }
        assertTrue("$what is drawn in ${expected.hex()}", pixels.any { it == argb })
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun modes() = listOf(
            arrayOf<Any>("light", UiModeManager.MODE_NIGHT_NO, LightColorScheme),
            arrayOf<Any>("dark", UiModeManager.MODE_NIGHT_YES, DarkColorScheme),
        )
    }
}

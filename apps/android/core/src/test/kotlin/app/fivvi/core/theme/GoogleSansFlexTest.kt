package app.fivvi.core.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontListFontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.font.ResourceFont
import androidx.compose.ui.unit.TextUnitType
import java.io.File
import java.nio.ByteBuffer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

// E020 AC10 and AC11 (spec #590): Fivvi Pro's text is Google Sans Flex, bundled in the app, with font scaling intact;
// numbers use its round axis with tabular digits.
class GoogleSansFlexTest {
    private val font = File("src/main/res/font/google_sans_flex.ttf")

    private fun Typography.styles(): Map<String, TextStyle> = mapOf(
        "displayLarge" to displayLarge, "displayMedium" to displayMedium, "displaySmall" to displaySmall,
        "headlineLarge" to headlineLarge, "headlineMedium" to headlineMedium, "headlineSmall" to headlineSmall,
        "titleLarge" to titleLarge, "titleMedium" to titleMedium, "titleSmall" to titleSmall,
        "bodyLarge" to bodyLarge, "bodyMedium" to bodyMedium, "bodySmall" to bodySmall,
        "labelLarge" to labelLarge, "labelMedium" to labelMedium, "labelSmall" to labelSmall,
    )

    @Test
    fun E020_AC10_everyTextStyleOfTheThemeIsGoogleSansFlex() {
        for ((name, style) in FivviTypography.styles()) {
            assertEquals("$name is not Google Sans Flex", FivviFonts.GoogleSansFlex, style.fontFamily)
        }
        assertEquals(FivviFonts.GoogleSansFlex, FivviTypography.bodyLargeEmphasized.fontFamily)
    }

    @Test
    fun E020_AC10_everyWeightTheAppUsesIsDrawnFromTheBundledVariableFont() {
        val fonts = faces(FivviFonts.GoogleSansFlex)

        assertEquals(
            setOf(FontWeight.Light, FontWeight.Normal, FontWeight.Medium, FontWeight.SemiBold, FontWeight.Bold),
            fonts.map { it.weight }.toSet(),
        )
        for (face in fonts) {
            val axes = axesOf(face)
            assertEquals("the weight axis follows the font weight", face.weight.weight.toFloat(), axes["wght"])
            assertTrue("the plain face has no round axis", "ROND" !in axes || axes["ROND"] == 0f)
        }
    }

    @Test
    fun E020_AC10_fontScalingIsIntactEverySizeIsInSpSoTheSystemScalesIt() {
        for ((name, style) in FivviTypography.styles()) {
            assertEquals("$name font size", TextUnitType.Sp, style.fontSize.type)
            assertEquals("$name line height", TextUnitType.Sp, style.lineHeight.type)
        }
    }

    @Test
    fun E020_AC10_theFontShipsInsideTheAppAsAVariableFontWithTheWeightAndRoundAxes() {
        assertTrue("no ${font.path}", font.isFile)

        val axes = Sfnt.axes(font.readBytes())

        assertEquals(setOf("wght", "ROND"), axes.keys)
        assertTrue(
            "weights 400 to 700 are covered: ${axes["wght"]}",
            axes.getValue("wght").let {
                it.start <= 400f &&
                    it.endInclusive >= 700f
            },
        )
        assertEquals(0f..100f, axes["ROND"])
    }

    @Test
    fun E020_AC10_theFontIsSubsetToLatinToKeepTheAppSmall() {
        // The full font is 3.7 MB. Latin, Latin-1 and Latin Extended-A with two axes come to about 170 KB.
        assertTrue("${font.length()} bytes", font.length() < 300_000)
    }

    @Test
    fun E020_AC10_theLicenceFileIsInTheRepoAndShipsWithTheApp() {
        val licence = File("src/main/assets/licenses/google-sans-flex-OFL.txt")

        assertTrue("no ${licence.path}", licence.isFile)
        val text = licence.readText()
        assertTrue(text.contains("SIL OPEN FONT LICENSE Version 1.1"))
        assertTrue(text.contains("Google Sans Flex"))
    }

    @Test
    fun E020_AC11_numbersUseTheRoundAxisOfGoogleSansFlexWithTabularDigits() {
        val numbers = TextStyle().numeric()

        assertEquals(FivviFonts.GoogleSansFlexRounded, numbers.fontFamily)
        assertEquals("tnum", numbers.fontFeatureSettings)
        assertNotEquals(FivviFonts.GoogleSansFlex, numbers.fontFamily)
        val fonts = faces(FivviFonts.GoogleSansFlexRounded)
        assertTrue(fonts.isNotEmpty())
        for (face in fonts) {
            assertEquals("round axis of ${face.weight}", 100f, axesOf(face)["ROND"])
        }
    }

    @Test
    fun E020_AC11_theNumericStyleKeepsTheSizeAndWeightOfTheStyleItIsAppliedTo() {
        val base = FivviTypography.titleLarge

        val numbers = base.numeric()

        assertEquals(base.fontSize, numbers.fontSize)
        assertEquals(base.fontWeight, numbers.fontWeight)
        assertEquals(base.lineHeight, numbers.lineHeight)
    }

    @Test
    fun E020_AC11_theFontFamilyOfTheTextIsNotTheSystemDefault() {
        assertNotEquals(FontFamily.Default, FivviTypography.bodyLarge.fontFamily)
    }

    private fun faces(family: FontFamily) = (family as FontListFontFamily).fonts.map { it as ResourceFont }

    private fun axesOf(face: ResourceFont) =
        face.variationSettings.settings.associate { it.axisName to it.toVariationValue(null) }

    // Reads the axes of a variable font: the sfnt table directory, then the `fvar` table.
    private object Sfnt {
        fun axes(bytes: ByteArray): Map<String, ClosedFloatingPointRange<Float>> {
            val buffer = ByteBuffer.wrap(bytes)
            val tables = buffer.getShort(4).toInt()
            val fvar = (0 until tables).map { 12 + 16 * it }.first { tag(bytes, it) == "fvar" }
            val start = buffer.getInt(fvar + 8)
            val axesAt = start + buffer.getShort(start + 4).toInt()
            val count = buffer.getShort(start + 8).toInt()
            val size = buffer.getShort(start + 10).toInt()
            return (0 until count).associate {
                val at = axesAt + it * size
                tag(bytes, at) to (fixed(buffer, at + 4)..fixed(buffer, at + 12))
            }
        }

        private fun tag(bytes: ByteArray, at: Int) = String(bytes, at, 4, Charsets.US_ASCII)

        private fun fixed(buffer: ByteBuffer, at: Int) = buffer.getInt(at) / 65536f
    }
}

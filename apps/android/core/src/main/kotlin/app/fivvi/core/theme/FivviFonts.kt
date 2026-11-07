package app.fivvi.core.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import app.fivvi.core.R

/**
 * Google Sans Flex (E020, spec #590), bundled in the app as one variable font (`res/font/google_sans_flex.ttf`), so no
 * request goes to Google. It is the SIL Open Font License 1.1; the licence is `assets/licenses/google-sans-flex-OFL.txt`.
 * The file is the full font subset to Latin and cut to two axes, weight and round (the README has the recipe).
 */
object FivviFonts {
    // The weights the type scale and the screens use. The variable font draws each one on its weight axis.
    private val weights = listOf(
        FontWeight.Light,
        FontWeight.Normal,
        FontWeight.Medium,
        FontWeight.SemiBold,
        FontWeight.Bold,
    )

    private fun family(round: Float) = FontFamily(
        weights.map { weight ->
            val axes = listOfNotNull(
                FontVariation.weight(weight.weight),
                FontVariation.Setting(ROUND_AXIS, round).takeIf { round > 0f },
            )
            Font(R.font.google_sans_flex, weight, variationSettings = FontVariation.Settings(*axes.toTypedArray()))
        },
    )

    /** All text: Google Sans Flex at its natural roundness. */
    val GoogleSansFlex: FontFamily = family(round = 0f)

    /** Numbers: the same font on its round axis (`ROND` 100), used with tabular digits (see [numeric]). */
    val GoogleSansFlexRounded: FontFamily = family(round = 100f)

    private const val ROUND_AXIS = "ROND"
}

/** Material 3's type scale, in Google Sans Flex. Every size stays in `sp`, so the system's font scale applies. */
val FivviTypography: Typography = Typography(fontFamily = FivviFonts.GoogleSansFlex)

/**
 * The style for numbers (AC11): Google Sans Flex's round axis with tabular digits, so a column of times or counts lines
 * up. Size, weight and line height stay those of the style it is applied to.
 */
fun TextStyle.numeric(): TextStyle = copy(fontFamily = FivviFonts.GoogleSansFlexRounded, fontFeatureSettings = "tnum")

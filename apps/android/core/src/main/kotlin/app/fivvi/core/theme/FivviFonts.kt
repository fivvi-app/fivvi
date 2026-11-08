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
 * Tabular digits (`tnum`), so every digit is as wide as the others and a column of counts lines up, in the face of the
 * style it is applied to. For a count inside a word ("Vol 3/8") where the round numerals of [numeric] would also round
 * the word.
 */
fun TextStyle.tabular(): TextStyle = copy(fontFeatureSettings = "tnum")

/**
 * The style for numbers on their own, such as a time or a weight (AC11): Google Sans Flex's round axis with tabular
 * digits. Size, weight and line height stay those of the style it is applied to. The generated `Typography.numericXl`
 * is the size and role only (its note says "+ tnum"); use `numericXl.numeric()`.
 */
fun TextStyle.numeric(): TextStyle = tabular().copy(fontFamily = FivviFonts.GoogleSansFlexRounded)

package app.fivvi.pro.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import app.fivvi.designtokens.DarkColorScheme
import app.fivvi.designtokens.LightColorScheme
import app.fivvi.designtokens.TokenShapes

/**
 * Fivvi's Material 3 theme (ADR-015, spec #34 AC6): the colour scheme generated from the design tokens for the
 * system's light or dark mode, the token shapes, and Material 3's own type scale in Roboto, the platform font, so font
 * scaling applies. No dynamic colour (Material You), so the brand looks the same on every phone.
 */
@Composable
fun FivviTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (isSystemInDarkTheme()) DarkColorScheme else LightColorScheme,
        shapes = TokenShapes,
        content = content,
    )
}

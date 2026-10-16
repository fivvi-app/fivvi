package nl.trainerhub.app.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import nl.trainerhub.designtokens.DarkColorScheme
import nl.trainerhub.designtokens.LightColorScheme
import nl.trainerhub.designtokens.TokenShapes

/**
 * Trainer Hub's Material 3 theme (ADR-015, spec #34 AC6): the colour scheme generated from the design tokens for the
 * system's light or dark mode, the token shapes, and Material 3's own type scale in Roboto, the platform font, so font
 * scaling applies. No dynamic colour (Material You), so the brand looks the same on every phone.
 */
@Composable
fun TrainerHubTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (isSystemInDarkTheme()) DarkColorScheme else LightColorScheme,
        shapes = TokenShapes,
        content = content,
    )
}

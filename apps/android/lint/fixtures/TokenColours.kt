// AC6 fixture: colours from the theme and the design tokens, which ktlintCheck accepts. Not compiled;
// NoColourLiteralRuleTest reads it.
package nl.trainerhub.lint.fixtures

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import nl.trainerhub.designtokens.DarkColorScheme
import nl.trainerhub.designtokens.LightColorScheme
import nl.trainerhub.designtokens.LightTokenColors

@Composable
fun TokenColours(label: String, dark: Boolean, tint: Color = Color.Unspecified) {
    MaterialTheme(colorScheme = if (dark) DarkColorScheme else LightColorScheme) {
        Text(label, color = MaterialTheme.colorScheme.primary)
        Text(label, color = LightTokenColors.sessionPrivateFg)
        Text(label, color = tint)
        Text(label, color = Color.Transparent)
        Text(label, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
    }
}

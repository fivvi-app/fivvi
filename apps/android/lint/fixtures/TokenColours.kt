// AC6 fixture: colours from the theme and the design tokens, which ktlintCheck accepts. Not compiled;
// NoColourLiteralRuleTest reads it.
package app.fivvi.lint.fixtures

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import app.fivvi.designtokens.DarkColorScheme
import app.fivvi.designtokens.DarkTokenColors
import app.fivvi.designtokens.LightColorScheme
import app.fivvi.designtokens.LightTokenColors

@Composable
fun TokenColours(label: String, dark: Boolean, tint: Color = Color.Unspecified) {
    MaterialTheme(colorScheme = if (dark) DarkColorScheme else LightColorScheme) {
        Text(label, color = MaterialTheme.colorScheme.primary)
        Text(label, color = (if (dark) DarkTokenColors else LightTokenColors).sessionPrivateFg)
        Text(label, color = tint)
        Text(label, color = Color.Transparent)
        Text(label, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
    }
}

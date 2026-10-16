// AC6 fixture: hard-coded colours in app code. ktlintCheck must fail on every colour below and name this file and line.
// Not compiled; NoColourLiteralRuleTest reads it.
package nl.trainerhub.lint.fixtures

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.colorResource
import androidx.core.graphics.toColorInt

@Composable
fun HardCodedColours(label: String) {
    Text(label, color = Color(0xFF595299))
    Text(label, color = Color(red = 0.2f, green = 0.3f, blue = 0.4f))
    Text(label, color = Color.Red)
    Text(label, color = androidx.compose.ui.graphics.Color.Blue)
    Text(label, color = Color.hsl(250f, 0.3f, 0.5f))
    Text(label, color = Color(android.graphics.Color.parseColor("#595299")))
    val brand = android.graphics.Color.parseColor("#595299")
    val accent = "#595299".toColorInt()
    Text(label, color = colorResource(R.color.brand))
    MaterialTheme(colorScheme = lightColorScheme()) {}
    MaterialTheme(colorScheme = darkColorScheme()) {}
    MaterialTheme(colorScheme = dynamicLightColorScheme(LocalContext.current)) {}
}

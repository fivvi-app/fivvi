// AC8 fixture: hard-coded text in Compose. ktlintCheck must fail on every Text below and name this file and line.
// Not compiled; NoLiteralTextRuleTest reads it.
package app.fivvi.lint.fixtures

import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable

@Composable
fun HardCodedText(name: String) {
    Text("Welkom bij Fivvi")
    Text(text = "Loading…", maxLines = 2)
    Button(onClick = {}) {
        Text("Try again")
    }
    Text("Hoi $name")
}

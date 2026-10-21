// AC8 fixture: text from resources, which ktlintCheck accepts. Not compiled; NoLiteralTextRuleTest reads it.
package app.fivvi.lint.fixtures

import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource

@Composable
fun ResourceText(greeting: String) {
    Text(stringResource(R.string.hello_title), modifier = Modifier.testTag("hello.greeting"))
    Text(text = greeting)
    Button(onClick = {}) {
        Text(stringResource(R.string.common_retry))
    }
    Text("$greeting")
    Log.d("Hello", "not shown to users")
}

package app.fivvi.pro.hello

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.body
import app.fivvi.designtokens.title1
import app.fivvi.pro.R

/** Test tags, shared with the iOS accessibility identifiers and the Maestro flows. */
object HelloTags {
    const val GREETING = "hello.greeting"
    const val LOADING = "hello.loading"
    const val ERROR = "hello.error"
    const val RETRY = "hello.retry"
}

/** The hello block: the greeting, or the loading indicator, or the error with its retry. The home gives it its scroll. */
@Composable
fun HelloContent(state: HelloState, onRetry: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.padding(Spacing.space6),
        verticalArrangement = Arrangement.spacedBy(Spacing.space4),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        when (state) {
            HelloState.Loading -> {
                val label = stringResource(R.string.common_loading)
                CircularProgressIndicator(Modifier.testTag(HelloTags.LOADING).semantics { contentDescription = label })
            }

            is HelloState.Loaded -> Text(
                text = stringResource(state.greeting),
                modifier = Modifier.testTag(HelloTags.GREETING).semantics { heading() },
                style = MaterialTheme.typography.title1,
                textAlign = TextAlign.Center,
            )

            HelloState.Failed -> {
                Text(
                    text = stringResource(R.string.hello_error),
                    modifier = Modifier.testTag(HelloTags.ERROR),
                    style = MaterialTheme.typography.body,
                    textAlign = TextAlign.Center,
                )
                Button(onClick = onRetry, modifier = Modifier.testTag(HelloTags.RETRY)) {
                    Text(stringResource(R.string.common_retry), textAlign = TextAlign.Center)
                }
            }
        }
    }
}

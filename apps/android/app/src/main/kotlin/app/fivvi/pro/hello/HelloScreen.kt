package app.fivvi.pro.hello

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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

@Composable
fun HelloScreen(state: HelloState, onRetry: () -> Unit, modifier: Modifier = Modifier) {
    // Scrolls, so text at the largest font scale wraps instead of being cut off.
    HelloContent(
        state,
        onRetry,
        modifier.fillMaxSize().safeDrawingPadding().verticalScroll(rememberScrollState()),
    )
}

/** The hello block without a scroll or window insets of its own, for a screen that scrolls as one (the home). */
@Composable
fun HelloContent(state: HelloState, onRetry: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.padding(Spacing.space6),
        verticalArrangement = Arrangement.spacedBy(Spacing.space4, Alignment.CenterVertically),
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

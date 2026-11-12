package app.fivvi.pro.hello

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
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
import app.fivvi.core.R
import app.fivvi.core.kit.FivviCard
import app.fivvi.core.kit.PillButton
import app.fivvi.core.kit.PillButtonStack
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.body
import app.fivvi.designtokens.title1

/** Test tags, shared with the iOS accessibility identifiers and the Maestro flows. */
object HelloTags {
    const val GREETING = "hello.greeting"
    const val LOADING = "hello.loading"
    const val ERROR = "hello.error"
    const val RETRY = "hello.retry"
}

/**
 * The hello block, a card: the greeting, or the loading indicator, or the error with its retry. The home gives it its
 * scroll.
 */
@Composable
fun HelloContent(state: HelloState, onRetry: () -> Unit, modifier: Modifier = Modifier) {
    FivviCard(modifier.fillMaxWidth(), contentPadding = Spacing.space6) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(Spacing.space4),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            when (state) {
                HelloState.Loading -> {
                    val label = stringResource(R.string.common_loading)
                    CircularProgressIndicator(
                        Modifier.testTag(HelloTags.LOADING).semantics { contentDescription = label },
                    )
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
                    PillButtonStack {
                        PillButton(
                            text = stringResource(R.string.common_retry),
                            onClick = onRetry,
                            modifier = Modifier.testTag(HelloTags.RETRY),
                        )
                    }
                }
            }
        }
    }
}

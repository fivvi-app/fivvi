package app.fivvi.pro.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
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
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.body
import app.fivvi.pro.R
import app.fivvi.pro.hello.HelloScreen
import app.fivvi.pro.hello.HelloState

/** Test tags, shared with the iOS accessibility identifiers and the Maestro flows. */
object HomeTags {
    const val SIGNED_IN_AS = "home.signedInAs"
    const val LOADING = "home.loading"
    const val ERROR = "home.error"
    const val RETRY = "home.retry"
}

/** The signed-in home (a placeholder): the hello screen and the address of the signed-in account. */
@Composable
fun HomeScreen(
    hello: HelloState,
    me: MeState,
    onRetryHello: () -> Unit,
    onRetryMe: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.fillMaxSize().safeDrawingPadding()) {
        HelloScreen(hello, onRetryHello, Modifier.weight(1f))
        Column(
            modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(Spacing.space6),
            verticalArrangement = Arrangement.spacedBy(Spacing.space4),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            when (me) {
                MeState.Loading -> {
                    val label = stringResource(R.string.common_loading)
                    CircularProgressIndicator(
                        Modifier.testTag(HomeTags.LOADING).semantics {
                            contentDescription = label
                        },
                    )
                }

                is MeState.Loaded -> Text(
                    text = stringResource(R.string.home_signed_in_as, me.email),
                    modifier = Modifier.testTag(HomeTags.SIGNED_IN_AS),
                    style = MaterialTheme.typography.body,
                    textAlign = TextAlign.Center,
                )

                MeState.Failed -> {
                    Text(
                        text = stringResource(R.string.sign_in_errors_generic),
                        modifier = Modifier.testTag(HomeTags.ERROR),
                        style = MaterialTheme.typography.body,
                        textAlign = TextAlign.Center,
                    )
                    Button(onClick = onRetryMe, modifier = Modifier.testTag(HomeTags.RETRY)) {
                        Text(stringResource(R.string.common_retry), textAlign = TextAlign.Center)
                    }
                }
            }
        }
    }
}

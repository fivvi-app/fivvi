package app.fivvi.pro.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.body
import app.fivvi.pro.R
import app.fivvi.pro.hello.HelloContent
import app.fivvi.pro.hello.HelloState

/** Test tags, shared with the iOS accessibility identifiers and the Maestro flows. */
object HomeTags {
    const val SIGNED_IN_AS = "home.signedInAs"
    const val LOADING = "home.loading"
    const val ERROR = "home.error"
    const val RETRY = "home.retry"
    const val SIGN_OUT = "home.signOut"
    const val SIGNING_OUT = "home.signingOut"
}

/**
 * The signed-in home (a placeholder): the hello screen, the address of the signed-in account and the sign-out button,
 * which a progress indicator replaces while [signingOut].
 */
@Composable
fun HomeScreen(
    hello: HelloState,
    me: MeState,
    signingOut: Boolean,
    onRetryHello: () -> Unit,
    onRetryMe: () -> Unit,
    onSignOut: () -> Unit,
    modifier: Modifier = Modifier,
) {
    // One scroll for the whole screen, so the account block can't squeeze the hello block at the largest font scale. The
    // spacers share what is left when both fit (the hello block centred above the account block) and give way when not.
    Column(
        modifier = modifier.fillMaxSize().safeDrawingPadding().verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.weight(1f))
        HelloContent(hello, onRetryHello)
        Spacer(Modifier.weight(1f))
        Column(
            modifier = Modifier.fillMaxWidth().padding(Spacing.space6),
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
            SignOut(signingOut, onSignOut)
        }
    }
}

@Composable
private fun SignOut(signingOut: Boolean, onSignOut: () -> Unit) {
    if (signingOut) {
        val label = stringResource(R.string.common_loading)
        CircularProgressIndicator(
            Modifier.testTag(HomeTags.SIGNING_OUT).semantics {
                contentDescription = label
                liveRegion = LiveRegionMode.Polite
            },
        )
    } else {
        OutlinedButton(
            onClick = onSignOut,
            modifier = Modifier.fillMaxWidth().heightIn(min = Spacing.space12).testTag(HomeTags.SIGN_OUT),
        ) {
            Text(stringResource(R.string.sign_out_label), textAlign = TextAlign.Center)
        }
    }
}

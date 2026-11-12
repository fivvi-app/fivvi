package app.fivvi.pro.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import app.fivvi.core.R
import app.fivvi.core.kit.FivviCard
import app.fivvi.core.kit.InsetGroupedList
import app.fivvi.core.kit.ListRow
import app.fivvi.core.kit.PillButton
import app.fivvi.core.kit.PillButtonStack
import app.fivvi.core.kit.PillButtonStyle
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.body
import app.fivvi.designtokens.title1
import app.fivvi.designtokens.title2
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
    const val WORKSPACE_NAME = "home.workspaceName"
    const val SET_UP_ON_WEB = "home.setUpOnWeb"
    const val OPEN_WEB = "home.openWeb"
    const val NO_ACCESS = "home.noAccess"
    const val OPEN_PROFILE = "home.openProfile"
    const val OPEN_CLIENTS = "home.openClients"
}

/**
 * The signed-in home (a placeholder, in the look of *Vandaag (TD-01)*'s large title and grouped list): the hello block,
 * the address of the signed-in account, the rows to Klanten and Profiel and the sign-out button, which a progress
 * indicator replaces while [signingOut]. [onOpenClients] is `null` where the person may not see clients.
 */
@Composable
fun HomeScreen(
    hello: HelloState,
    me: MeState,
    signingOut: Boolean,
    onRetryHello: () -> Unit,
    onRetryMe: () -> Unit,
    onSignOut: () -> Unit,
    onOpenWeb: () -> Unit,
    onOpenProfile: () -> Unit,
    modifier: Modifier = Modifier,
    onOpenClients: (() -> Unit)? = null,
) {
    // One scroll for the whole screen, so the account block can't squeeze the hello block at the largest font scale.
    Column(
        modifier = modifier.fillMaxSize().safeDrawingPadding().verticalScroll(rememberScrollState())
            .padding(Spacing.space4),
        verticalArrangement = Arrangement.spacedBy(Spacing.space4),
    ) {
        Destination(hello, me, onRetryHello, onOpenWeb)
        when (me) {
            MeState.Loading -> {
                val label = stringResource(R.string.common_loading)
                CircularProgressIndicator(
                    Modifier.align(Alignment.CenterHorizontally).testTag(HomeTags.LOADING).semantics {
                        contentDescription = label
                    },
                )
            }

            is MeState.Loaded -> Text(
                text = stringResource(R.string.home_signed_in_as, me.email),
                modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.space1).testTag(HomeTags.SIGNED_IN_AS),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.body,
            )

            MeState.Failed -> {
                Text(
                    text = stringResource(R.string.sign_in_errors_generic),
                    modifier = Modifier.fillMaxWidth().testTag(HomeTags.ERROR),
                    style = MaterialTheme.typography.body,
                )
                PillButtonStack {
                    PillButton(
                        text = stringResource(R.string.common_retry),
                        onClick = onRetryMe,
                        modifier = Modifier.testTag(HomeTags.RETRY),
                    )
                }
            }
        }
        // Klanten (TM-02) is reached from here when the capability helper lists `clients.view` for the workspace shown, and
        // Profiel (TM-04) once the account has answered (it lists the workspaces, whatever the home shows).
        if (me is MeState.Loaded) {
            InsetGroupedList {
                if (onOpenClients != null) {
                    row {
                        ListRow(
                            title = stringResource(R.string.clients_title),
                            modifier = Modifier.testTag(HomeTags.OPEN_CLIENTS),
                            onClick = onOpenClients,
                            chevron = true,
                        )
                    }
                }
                row {
                    ListRow(
                        title = stringResource(R.string.profile_title),
                        modifier = Modifier.testTag(HomeTags.OPEN_PROFILE),
                        onClick = onOpenProfile,
                        chevron = true,
                    )
                }
            }
        }
        SignOut(signingOut, onSignOut)
    }
}

// The part above the account block: what the API said the person gets (F002 AC10). The hello block is the placeholder of
// the workspace's home; the other two states have nothing but their text.
@Composable
private fun Destination(hello: HelloState, me: MeState, onRetryHello: () -> Unit, onOpenWeb: () -> Unit) {
    when (val destination = (me as? MeState.Loaded)?.destination) {
        // Loading or failed: /me has not said, so the hello block stays, as before F002.
        null -> HelloContent(hello, onRetryHello)

        is HomeDestination.Workspace -> {
            Text(
                text = destination.name,
                modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.space1).testTag(HomeTags.WORKSPACE_NAME)
                    .semantics { heading() },
                style = MaterialTheme.typography.title1,
            )
            HelloContent(hello, onRetryHello)
        }

        HomeDestination.SetUpOnWeb -> FivviCard(Modifier.fillMaxWidth()) {
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.space4)) {
                Text(
                    text = stringResource(R.string.home_set_up_on_web),
                    modifier = Modifier.fillMaxWidth().testTag(HomeTags.SET_UP_ON_WEB),
                    style = MaterialTheme.typography.title2,
                )
                PillButtonStack {
                    PillButton(
                        text = stringResource(R.string.home_open_web),
                        onClick = onOpenWeb,
                        modifier = Modifier.testTag(HomeTags.OPEN_WEB),
                    )
                }
            }
        }

        HomeDestination.NoAccess -> FivviCard(Modifier.fillMaxWidth().testTag(HomeTags.NO_ACCESS)) {
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.space2)) {
                Text(
                    text = stringResource(R.string.no_access_title),
                    modifier = Modifier.semantics { heading() },
                    style = MaterialTheme.typography.title2,
                )
                Text(text = stringResource(R.string.no_access_body), style = MaterialTheme.typography.body)
            }
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
        PillButtonStack {
            PillButton(
                text = stringResource(R.string.sign_out_label),
                onClick = onSignOut,
                modifier = Modifier.testTag(HomeTags.SIGN_OUT),
                style = PillButtonStyle.Tonal,
            )
        }
    }
}

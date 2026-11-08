package app.fivvi.client.shell

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
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
import app.fivvi.client.account.AccountState
import app.fivvi.core.R
import app.fivvi.core.kit.FivviCard
import app.fivvi.core.ui.LoadError
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.body
import app.fivvi.designtokens.title1

/**
 * Test tags of one tab's no-workspace state, shared with the iOS accessibility identifiers: `home.noWorkspace`,
 * `home.haveLink`, `home.teamHint`, `home.loading`, `home.error`, `home.retry`, and the same for `book`.
 */
class NoWorkspaceTags(prefix: String) {
    val title = "$prefix.noWorkspace"
    val haveLink = "$prefix.haveLink"
    val teamHint = "$prefix.teamHint"
    val loading = "$prefix.loading"
    val error = "$prefix.error"
    val retry = "$prefix.retry"
}

val HomeTags = NoWorkspaceTags("home")
val BookTags = NoWorkspaceTags("book")

/**
 * *Home* and *Boeken* until the client belongs to a workspace (F029, F032): "Vraag je studio om de aanmeldlink." with
 * "Heb je de link al? Open hem op deze telefoon." When the account has a team role somewhere it also says "Ben je trainer
 * of eigenaar? Gebruik de app Fivvi Pro." and shows no team data (E017 AC3). Scrolls, so text at the largest font scale
 * wraps instead of being cut off.
 */
@Composable
fun NoWorkspaceScreen(state: AccountState, tags: NoWorkspaceTags, onRetry: () -> Unit) {
    when (state) {
        AccountState.Loading -> Loading(tags)

        AccountState.Failed -> LoadError(R.string.sign_in_errors_generic, tags.error, tags.retry, onRetry)

        is AccountState.Loaded -> Column(
            modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(Spacing.space6),
            verticalArrangement = Arrangement.spacedBy(Spacing.space4, Alignment.CenterVertically),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Line(R.string.no_workspace_title, tags.title, heading = true)
            FivviCard(Modifier.fillMaxWidth()) {
                Column(verticalArrangement = Arrangement.spacedBy(Spacing.space4)) {
                    Line(R.string.no_workspace_have_link, tags.haveLink)
                    if (state.hasTeamRole) Line(R.string.no_workspace_team_hint, tags.teamHint)
                }
            }
        }
    }
}

@Composable
private fun Line(@StringRes text: Int, tag: String, heading: Boolean = false) {
    Text(
        text = stringResource(text),
        modifier = Modifier.fillMaxWidth().testTag(tag).semantics { if (heading) heading() },
        style = if (heading) MaterialTheme.typography.title1 else MaterialTheme.typography.body,
    )
}

@Composable
private fun Loading(tags: NoWorkspaceTags) {
    val description = stringResource(R.string.common_loading)
    Column(
        Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        CircularProgressIndicator(
            Modifier.testTag(tags.loading).semantics {
                contentDescription = description
                liveRegion = LiveRegionMode.Polite
            },
        )
    }
}

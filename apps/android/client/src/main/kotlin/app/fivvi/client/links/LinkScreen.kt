package app.fivvi.client.links

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import app.fivvi.core.R
import app.fivvi.core.kit.FivviCard
import app.fivvi.core.kit.PillButton
import app.fivvi.core.kit.RoundControl
import app.fivvi.core.kit.RoundControlStyle
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.body

/** Test tags of the link screen, shared with the iOS accessibility identifiers (`link.soon`, `link.openInBrowser`). */
object LinkTags {
    const val BACK = "link.back"
    const val SOON = "link.soon"
    const val OPEN_IN_BROWSER = "link.openInBrowser"
}

/**
 * Where a join link or an invitation link goes until F029 and F032 build their screens: "Deze link openen we binnenkort in
 * de app." with *Openen in de browser*, which opens the same address in the browser. A sub page, so it has the back button
 * at the top (DECISIONS.md section 5b); back returns to the tabs. F029 and F032 replace the branch of their destination.
 */
@Composable
fun LinkScreen(link: OpenedLink, onOpenInBrowser: (String) -> Unit, onBack: () -> Unit) {
    BackHandler(onBack = onBack)
    when (link.destination) {
        is LinkDestination.Join, is LinkDestination.Invitation -> LinkPlaceholder(link.url, onOpenInBrowser, onBack)
    }
}

@Composable
private fun LinkPlaceholder(url: String, onOpenInBrowser: (String) -> Unit, onBack: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().safeDrawingPadding().verticalScroll(rememberScrollState())
            .padding(Spacing.space4),
        verticalArrangement = Arrangement.spacedBy(Spacing.space4),
    ) {
        RoundControl(
            icon = painterResource(R.drawable.ic_arrow_back),
            contentDescription = stringResource(R.string.app_link_back),
            onClick = onBack,
            modifier = Modifier.testTag(LinkTags.BACK),
            style = RoundControlStyle.Tonal,
        )
        FivviCard(Modifier.fillMaxWidth()) {
            Text(
                text = stringResource(R.string.app_link_soon),
                modifier = Modifier.fillMaxWidth().testTag(LinkTags.SOON),
                style = MaterialTheme.typography.body,
            )
        }
        PillButton(
            text = stringResource(R.string.app_link_open_in_browser),
            onClick = { onOpenInBrowser(url) },
            modifier = Modifier.fillMaxWidth().testTag(LinkTags.OPEN_IN_BROWSER),
        )
    }
}

package app.fivvi.core.ui

import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import app.fivvi.core.R
import app.fivvi.core.kit.PillButton
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.body
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** A grey block of a loading skeleton, in the shape of the text it stands for. */
@Composable
fun Modifier.placeholder(): Modifier =
    background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(Spacing.space1))

/** "Je bent offline. Laatst bijgewerkt om 08:42." above the content that was read before. */
@Composable
fun OfflineBanner(updatedAt: Instant, zone: ZoneId, tag: String) {
    val time = remember(updatedAt, zone) { TIME.withZone(zone).format(updatedAt) }
    Text(
        text = stringResource(R.string.clients_offline, time),
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.secondaryContainer)
            .padding(horizontal = Spacing.space4, vertical = Spacing.space2)
            .testTag(tag),
        color = MaterialTheme.colorScheme.onSecondaryContainer,
        style = MaterialTheme.typography.body,
    )
}

/** "Je bent offline. Sommige gegevens zijn misschien niet actueel." at the top of a screen that has no list with a time of its own. */
@Composable
fun OfflineNotice(tag: String) {
    val message = stringResource(R.string.common_offline)
    Text(
        text = message,
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.secondaryContainer)
            .padding(horizontal = Spacing.space4, vertical = Spacing.space2)
            .testTag(tag)
            .semantics { liveRegion = LiveRegionMode.Polite },
        color = MaterialTheme.colorScheme.onSecondaryContainer,
        style = MaterialTheme.typography.body,
    )
}

private val TIME: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

/** The error state of a load: what went wrong in [message] and a retry button. */
@Composable
fun LoadError(@StringRes message: Int, errorTag: String, retryTag: String, onRetry: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(Spacing.space6),
        verticalArrangement = Arrangement.spacedBy(Spacing.space4),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = stringResource(message),
            modifier = Modifier.testTag(errorTag),
            style = MaterialTheme.typography.body,
            textAlign = TextAlign.Center,
        )
        PillButton(
            text = stringResource(R.string.common_retry),
            onClick = onRetry,
            modifier = Modifier.testTag(retryTag),
        )
    }
}

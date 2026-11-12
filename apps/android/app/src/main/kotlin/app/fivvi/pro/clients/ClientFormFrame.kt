package app.fivvi.pro.clients

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import app.fivvi.core.R
import app.fivvi.core.kit.PillButton
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.headline

/** The test tags of the bar of a full-screen client form. */
internal class ClientFormBarTags(val title: String, val close: String, val submit: String, val pending: String)

/**
 * The frame of the add and the edit form, as the name editor of *Profiel* has it: a bar on top with ✕, the title and the
 * pill button ([submitText]) or, while [pending], a progress indicator, so the keyboard never covers them, and the fields
 * below in a scrolling column.
 */
@Composable
internal fun ClientFormFrame(
    title: String,
    tags: ClientFormBarTags,
    submitText: String,
    pending: Boolean,
    onClose: () -> Unit,
    onSubmit: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(modifier.fillMaxSize().safeDrawingPadding()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.space2, vertical = Spacing.space2),
            horizontalArrangement = Arrangement.spacedBy(Spacing.space2),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onClose, modifier = Modifier.testTag(tags.close)) {
                Icon(
                    painterResource(R.drawable.ic_close),
                    contentDescription = stringResource(R.string.clients_add_dialog_close),
                )
            }
            Text(
                text = title,
                modifier = Modifier.weight(1f).testTag(tags.title).semantics { heading() },
                style = MaterialTheme.typography.headline,
                textAlign = TextAlign.Center,
            )
            if (pending) {
                val label = stringResource(R.string.common_loading)
                CircularProgressIndicator(
                    Modifier.padding(horizontal = Spacing.space4).testTag(tags.pending)
                        .semantics { contentDescription = label },
                )
            } else {
                PillButton(text = submitText, onClick = onSubmit, modifier = Modifier.testTag(tags.submit))
            }
        }
        Column(
            modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(Spacing.space4),
            verticalArrangement = Arrangement.spacedBy(Spacing.space4),
            content = content,
        )
    }
}

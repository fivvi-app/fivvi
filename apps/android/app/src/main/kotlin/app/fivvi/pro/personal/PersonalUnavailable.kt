package app.fivvi.pro.personal

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import app.fivvi.core.R
import app.fivvi.core.kit.PillButton
import app.fivvi.core.kit.PillButtonStyle
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.body
import app.fivvi.pro.clients.BackButton

/** Test tags of the screen that stands in for TD-02 or TD-03 while the item's workspace can't be read. */
object PersonalTags {
    const val BACK = "personal.back"
    const val LOADING = "personal.loading"
    const val UNAVAILABLE = "personal.unavailable"
    const val RETRY = "personal.retry"
}

/**
 * What opens in place of TD-02 or TD-03 of an item whose workspace can't be read (F013 AC4): *Je bent offline…* without a
 * connection, otherwise *De gegevens konden niet worden geladen.*, with *Opnieuw*, which reads the account again, and back to
 * Vandaag. It is not the text of Vandaag failing.
 */
@Composable
fun PersonalUnavailable(
    state: PersonalDestinationViewModel.State,
    onRetry: () -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier.fillMaxSize().safeDrawingPadding()) {
        BackButton(PersonalTags.BACK, onBack)
        Column(Modifier.padding(Spacing.space4), verticalArrangement = Arrangement.spacedBy(Spacing.space4)) {
            val message = when (state) {
                PersonalDestinationViewModel.State.Offline -> R.string.common_offline
                PersonalDestinationViewModel.State.Unavailable -> R.string.sessions_form_load_failed
                else -> null
            }
            if (message == null) {
                val label = stringResource(R.string.common_loading)
                CircularProgressIndicator(
                    Modifier.testTag(PersonalTags.LOADING).semantics {
                        contentDescription = label
                    },
                )
            } else {
                Text(
                    stringResource(message),
                    modifier = Modifier.testTag(PersonalTags.UNAVAILABLE),
                    style = MaterialTheme.typography.body,
                )
                PillButton(
                    text = stringResource(R.string.my_day_app_retry),
                    onClick = onRetry,
                    modifier = Modifier.testTag(PersonalTags.RETRY),
                    style = PillButtonStyle.Tonal,
                )
            }
        }
    }
}

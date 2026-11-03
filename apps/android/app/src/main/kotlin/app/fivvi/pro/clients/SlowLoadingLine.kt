package app.fivvi.pro.clients

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import app.fivvi.designtokens.body
import app.fivvi.pro.R
import kotlinx.coroutines.delay

/** The line a skeleton shows once loading takes longer than usual: after 10 s (`information-architecture.md §9.5`). */
@Composable
internal fun SlowLoadingLine(tag: String) {
    var slow by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        delay(SLOW_AFTER_MILLIS)
        slow = true
    }
    if (slow) {
        Text(
            text = stringResource(R.string.common_loading_slow),
            modifier = Modifier.testTag(tag),
            style = MaterialTheme.typography.body,
        )
    }
}

/** How long the skeleton waits before it says that it takes longer than usual. */
internal const val SLOW_AFTER_MILLIS = 10_000L

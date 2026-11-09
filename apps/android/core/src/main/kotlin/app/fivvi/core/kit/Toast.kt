package app.fivvi.core.kit

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarData
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarVisuals
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import app.fivvi.core.R
import app.fivvi.designtokens.Radius
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.body

private val ToastIconSize = 20.dp

/** What a toast says and whether it is a warning (it then shows the warning icon). */
data class ToastVisuals(
    override val message: String,
    val warning: Boolean = false,
    override val duration: SnackbarDuration = SnackbarDuration.Short,
) : SnackbarVisuals {
    override val actionLabel: String? = null
    override val withDismissAction: Boolean = false
}

/**
 * The toast (AC14, DECISIONS.md section 2): a short message on the inverse surface. A warning toast starts with the
 * warning icon, so colour is never the only signal. Show one with [SnackbarHostState.showSnackbar] and a [ToastVisuals],
 * rendered by [ToastHost].
 */
@Composable
fun Toast(message: String, modifier: Modifier = Modifier, warning: Boolean = false) {
    Snackbar(
        modifier = modifier,
        shape = RoundedCornerShape(Radius.sm),
        containerColor = MaterialTheme.colorScheme.inverseSurface,
        contentColor = MaterialTheme.colorScheme.inverseOnSurface,
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(Spacing.space3),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (warning) {
                Icon(
                    painterResource(R.drawable.ic_warning),
                    contentDescription = null,
                    modifier = Modifier.size(ToastIconSize),
                )
            }
            Text(message, style = MaterialTheme.typography.body)
        }
    }
}

/** The host that shows a [ToastVisuals] (or any other snackbar's message) as a [Toast]. */
@Composable
fun ToastHost(state: SnackbarHostState, modifier: Modifier = Modifier) {
    SnackbarHost(state, modifier) { data: SnackbarData ->
        Toast(data.visuals.message, warning = (data.visuals as? ToastVisuals)?.warning == true)
    }
}

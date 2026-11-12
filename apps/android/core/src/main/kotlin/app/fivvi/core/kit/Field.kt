package app.fivvi.core.kit

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.fivvi.core.R
import app.fivvi.designtokens.Radius
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.footnote

private val ErrorIconSize = 16.dp

/**
 * A text field with its error state (AC14, DECISIONS.md section 2): with an [error] the field turns red (outline and
 * label), and the message sits under it behind a warning icon. Colour is never the only signal: the icon and the message
 * say it too, and a screen reader reads the message as the field's error. The caller words the message; none is made here.
 * [help] is a line under the field while it has no message of its own. With `showsErrorMessage = false` the field turns
 * red and is read as in error, but the message is not drawn: the caller puts a [FieldErrorLine] under it, where it can
 * tag it and keep it out of the field's own text.
 */
@Composable
fun FivviField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    error: String? = null,
    enabled: Boolean = true,
    singleLine: Boolean = true,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
    showsErrorMessage: Boolean = true,
    help: String? = null,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier.fillMaxWidth().let { if (error != null) it.semantics { error(error) } else it },
        enabled = enabled,
        label = { Text(label) },
        supportingText = when {
            error != null && showsErrorMessage -> ({ FieldErrorLine(error) })
            help != null -> ({ Text(help, style = MaterialTheme.typography.footnote) })
            else -> null
        },
        isError = error != null,
        singleLine = singleLine,
        shape = RoundedCornerShape(Radius.sm),
        keyboardOptions = keyboardOptions,
        keyboardActions = keyboardActions,
    )
}

/**
 * The message under a field in its error state: the warning icon, then the words, in the error colour. [FivviField] shows
 * it by itself; a screen that has to tag the message, or keep it out of the field's own text, passes `showsErrorMessage =
 * false` to the field and puts this under it. [modifier] goes on the words, so a tag or a live region sits on the text.
 */
@Composable
fun FieldErrorLine(message: String, modifier: Modifier = Modifier) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(Spacing.space1),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(
            painterResource(R.drawable.ic_warning),
            contentDescription = null,
            modifier = Modifier.size(ErrorIconSize),
            tint = MaterialTheme.colorScheme.error,
        )
        Text(
            message,
            modifier = modifier,
            color = MaterialTheme.colorScheme.error,
            style = MaterialTheme.typography.footnote,
        )
    }
}

package app.fivvi.pro.clients

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import app.fivvi.api.models.Locale
import app.fivvi.core.R
import app.fivvi.designtokens.footnote

/** Test tags, shared with the iOS accessibility identifiers and the Maestro flows; the fields' tags are `clients.add.*`. */
object AddClientTags {
    const val PREFIX = "clients.add"
    const val TITLE = "clients.add.title"
    const val CLOSE = "clients.add.close"
    const val SUBMIT = "clients.add.submit"
    const val PENDING = "clients.add.pending"

    /** The note under the fields: what the client gets. */
    const val DESCRIPTION = "clients.add.description"
}

/** What the full-screen form asks of its host. */
data class AddClientActions(val onClose: () -> Unit, val onSubmit: () -> Unit, val fields: ClientFormActions)

/**
 * *+ Nieuwe klant* (F006 AC1 to AC3, AC12) as a full-screen dialog (`information-architecture.md §5.2`): ✕ and *Toevoegen*
 * in the bar, then *Naam* (focused), *E-mailadres* (required) and *Taal voor e-mails*, and the note under them. It is a
 * full-screen surface in the app's own hierarchy, not a second window, so the keyboard, TalkBack and Maestro treat it as
 * the rest of the app. A refused or failed add keeps the input.
 */
@Composable
fun AddClientScreen(
    state: AddClientState,
    workspaceDefault: Locale,
    actions: AddClientActions,
    modifier: Modifier = Modifier,
) {
    ClientFormFrame(
        title = stringResource(R.string.clients_new_client),
        tags = ClientFormBarTags(
            AddClientTags.TITLE,
            AddClientTags.CLOSE,
            AddClientTags.SUBMIT,
            AddClientTags.PENDING,
        ),
        submitText = stringResource(R.string.clients_add_dialog_submit),
        pending = state.pending,
        onClose = actions.onClose,
        onSubmit = actions.onSubmit,
        modifier = modifier,
    ) {
        ClientFormFields(
            tag = AddClientTags.PREFIX,
            form = state.form,
            messages = ClientFormMessages(state.nameError, state.emailError, state.duplicate, state.failed),
            workspaceDefault = workspaceDefault,
            enabled = !state.pending,
            actions = actions.fields,
        )
        Text(
            text = stringResource(R.string.clients_add_dialog_description),
            modifier = Modifier.testTag(AddClientTags.DESCRIPTION),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.footnote,
        )
    }
}

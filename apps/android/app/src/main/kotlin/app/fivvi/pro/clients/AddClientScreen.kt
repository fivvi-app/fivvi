package app.fivvi.pro.clients

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import app.fivvi.api.models.Locale
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.body
import app.fivvi.pro.R

/** Test tags, shared with the iOS accessibility identifiers and the Maestro flows; the fields' tags are `clients.add.*`. */
object AddClientTags {
    const val PREFIX = "clients.add"
    const val TITLE = "clients.add.title"
    const val CLOSE = "clients.add.close"
    const val SUBMIT = "clients.add.submit"
    const val PENDING = "clients.add.pending"
}

/** What the full-screen form asks of its host. */
data class AddClientActions(val onClose: () -> Unit, val onSubmit: () -> Unit, val fields: ClientFormActions)

/**
 * *+ Nieuwe klant* (F006 AC1 to AC3, AC12) as a full-screen dialog (`information-architecture.md §5.2`): ✕ and *Toevoegen*
 * in the bar, then *Naam* (focused), *E-mailadres (optioneel)* and *Taal voor e-mails*. It is a full-screen surface in the
 * app's own hierarchy, not a second window, so the keyboard, TalkBack and Maestro treat it as the rest of the app. A
 * refused or failed add keeps the input.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddClientScreen(
    state: AddClientState,
    workspaceDefault: Locale,
    actions: AddClientActions,
    modifier: Modifier = Modifier,
) {
    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        stringResource(R.string.clients_new_client),
                        modifier = Modifier.testTag(AddClientTags.TITLE).semantics { heading() },
                    )
                },
                navigationIcon = {
                    IconButton(onClick = actions.onClose, modifier = Modifier.testTag(AddClientTags.CLOSE)) {
                        Icon(
                            painterResource(R.drawable.ic_close),
                            contentDescription = stringResource(R.string.clients_add_dialog_close),
                        )
                    }
                },
                actions = {
                    if (state.pending) {
                        val label = stringResource(R.string.common_loading)
                        CircularProgressIndicator(
                            Modifier.padding(end = Spacing.space4).testTag(AddClientTags.PENDING)
                                .semantics { contentDescription = label },
                        )
                    } else {
                        TextButton(onClick = actions.onSubmit, modifier = Modifier.testTag(AddClientTags.SUBMIT)) {
                            Text(stringResource(R.string.clients_add_dialog_submit))
                        }
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).imePadding().verticalScroll(rememberScrollState())
                .padding(Spacing.space4),
            verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(Spacing.space4),
        ) {
            Text(
                text = stringResource(R.string.clients_add_dialog_description),
                style = MaterialTheme.typography.body,
            )
            ClientFormFields(
                tag = AddClientTags.PREFIX,
                form = state.form,
                messages = ClientFormMessages(state.nameError, state.emailError, state.duplicate, state.failed),
                workspaceDefault = workspaceDefault,
                enabled = !state.pending,
                actions = actions.fields,
            )
        }
    }
}

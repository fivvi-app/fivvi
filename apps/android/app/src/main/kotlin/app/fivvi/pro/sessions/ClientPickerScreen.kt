package app.fivvi.pro.sessions

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import app.fivvi.api.models.Client
import app.fivvi.core.R
import app.fivvi.core.kit.FivviCard
import app.fivvi.core.kit.GroupGap
import app.fivvi.core.kit.ListRow
import app.fivvi.core.kit.SearchField
import app.fivvi.core.kit.groupRowCorners
import app.fivvi.core.theme.tokens
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.body
import app.fivvi.designtokens.title1
import app.fivvi.pro.clients.BackButton
import app.fivvi.pro.clients.ClientsState

/** Test tags, shared with the iOS accessibility identifiers and the Maestro flows. */
object ClientPickerTags {
    const val BACK = "clientPicker.back"
    const val TITLE = "clientPicker.title"
    const val SEARCH = "clientPicker.search"
    const val ADD = "clientPicker.add"
    const val LOADING = "clientPicker.loading"
    const val ERROR = "clientPicker.error"
    const val RETRY = "clientPicker.retry"
    const val NO_RESULTS = "clientPicker.noResults"
    const val NO_PERMISSION = "clientPicker.noPermission"

    /** `clientPicker.row.<id>` is the row of the client. */
    const val ROW = "clientPicker.row"
}

/** What the client list of PS-04 asks of its host. */
class ClientPickerActions(
    val onBack: () -> Unit,
    val onQueryChange: (String) -> Unit,
    val onRetry: () -> Unit,
    val onPick: (Client) -> Unit,
    /** `null` when the person may not add clients: *+ Nieuwe klant* is not shown (F004 AC10, `clients.manage`). */
    val onAdd: (() -> Unit)?,
)

/**
 * PS-04's client list: the workspace's clients with a search, and *+ Nieuwe klant* (the quick add of *Klanten*, the same
 * form) for whoever may manage clients. A row chooses the client and goes back. It shows the list of *Klanten*, so a
 * client added here is in *Klanten* too.
 */
@Composable
fun ClientPickerScreen(
    state: ClientsState,
    query: String,
    workspaceName: String,
    actions: ClientPickerActions,
    modifier: Modifier = Modifier,
) {
    Column(modifier.fillMaxSize().safeDrawingPadding()) {
        BackButton(ClientPickerTags.BACK, actions.onBack)
        Text(
            text = stringResource(R.string.sessions_form_client_label),
            modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.space5).padding(bottom = Spacing.space3)
                .testTag(ClientPickerTags.TITLE).semantics { heading() },
            style = MaterialTheme.typography.title1,
        )
        if (state is ClientsState.NoAccess) {
            FivviCard(
                Modifier.fillMaxWidth().padding(horizontal = Spacing.space4).testTag(ClientPickerTags.NO_PERMISSION),
            ) {
                Text(
                    text = stringResource(R.string.no_permission_body, workspaceName),
                    style = MaterialTheme.typography.body,
                )
            }
            return@Column
        }
        SearchField(
            value = query,
            onValueChange = actions.onQueryChange,
            placeholder = stringResource(R.string.sessions_form_client_search),
            modifier = Modifier.padding(horizontal = Spacing.space4).testTag(ClientPickerTags.SEARCH),
        )
        when (state) {
            ClientsState.Loading -> Column(Modifier.padding(Spacing.space6)) { Loading(ClientPickerTags.LOADING) }

            ClientsState.Failed -> Column(
                Modifier.fillMaxWidth().padding(Spacing.space6),
                verticalArrangement = Arrangement.spacedBy(Spacing.space4),
            ) {
                Text(
                    text = stringResource(R.string.clients_load_error),
                    modifier = Modifier.fillMaxWidth().testTag(ClientPickerTags.ERROR),
                    style = MaterialTheme.typography.body,
                    textAlign = TextAlign.Center,
                )
                app.fivvi.core.kit.PillButton(
                    text = stringResource(R.string.common_retry),
                    onClick = actions.onRetry,
                    modifier = Modifier.testTag(ClientPickerTags.RETRY),
                )
            }

            is ClientsState.Loaded -> Loaded(state, query, actions)

            ClientsState.NoAccess -> Unit
        }
    }
}

@Composable
private fun Loaded(state: ClientsState.Loaded, query: String, actions: ClientPickerActions) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = Spacing.space4, vertical = Spacing.space3),
        verticalArrangement = Arrangement.spacedBy(GroupGap),
    ) {
        actions.onAdd?.let { add ->
            item {
                val typed = query.trim()
                Text(
                    text = if (typed.isEmpty()) {
                        stringResource(R.string.sessions_form_client_new)
                    } else {
                        stringResource(R.string.sessions_form_client_new_named, typed)
                    },
                    modifier = Modifier.fillMaxWidth().clickable(onClick = add).testTag(ClientPickerTags.ADD)
                        .padding(horizontal = Spacing.space4, vertical = Spacing.space4),
                    color = MaterialTheme.tokens.accentText,
                    style = MaterialTheme.typography.body.copy(fontWeight = FontWeight.SemiBold),
                )
            }
        }
        if (state.clients.isEmpty()) {
            item {
                Text(
                    text = stringResource(R.string.sessions_form_client_none),
                    modifier = Modifier.fillMaxWidth().padding(Spacing.space4).testTag(ClientPickerTags.NO_RESULTS),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.body,
                )
            }
        }
        itemsIndexed(state.clients, key = { _, client -> client.id }) { index, client ->
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = groupRowCorners(index, state.clients.size).shape,
                color = MaterialTheme.colorScheme.surfaceContainerLowest,
                contentColor = MaterialTheme.colorScheme.onSurface,
            ) {
                ListRow(
                    title = client.name,
                    subtitle = client.email,
                    modifier = Modifier.testTag("${ClientPickerTags.ROW}.${client.id}"),
                    onClick = { actions.onPick(client) },
                )
            }
        }
    }
}

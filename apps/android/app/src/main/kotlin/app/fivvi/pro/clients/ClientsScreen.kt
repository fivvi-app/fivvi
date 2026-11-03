package app.fivvi.pro.clients

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import app.fivvi.api.models.Client
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.body
import app.fivvi.designtokens.subhead
import app.fivvi.designtokens.title2
import app.fivvi.pro.R
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.UUID

/** Test tags, shared with the iOS accessibility identifiers and the Maestro flows. */
object ClientsTags {
    const val TITLE = "clients.title"
    const val BACK = "clients.back"
    const val SEARCH = "clients.search"
    const val LIST = "clients.list"
    const val ADD = "clients.add"
    const val LOADING = "clients.loading"
    const val LOADING_SLOW = "clients.loadingSlow"
    const val ERROR = "clients.error"
    const val RETRY = "clients.retry"
    const val EMPTY = "clients.empty"
    const val NO_RESULTS = "clients.noResults"
    const val OFFLINE = "clients.offline"
    const val PARTIAL = "clients.partial"
    const val NO_PERMISSION = "clients.noPermission"

    /** Row tags end in the client's ID: `clients.row.<id>` is the row, `clients.rowName.<id>` its name. */
    const val ROW = "clients.row"
    const val ROW_NAME = "clients.rowName"
    const val ROW_EMAIL = "clients.rowEmail"
}

/** What the list asks of its host. */
data class ClientsActions(
    val onBack: () -> Unit,
    val onQueryChange: (String) -> Unit,
    val onRefresh: () -> Unit,
    val onRetry: () -> Unit,
    val onOpen: (UUID) -> Unit,
    /** `null` when the person may not add clients: *+ Nieuwe klant* is not shown (F004 AC10, `clients.manage`). */
    val onAdd: (() -> Unit)?,
)

/**
 * *Klanten* / *Clients* (TM-02, F006 AC6, AC12): a top bar with the title, the search field (matches name and address as
 * you type, in the API), the list with pull to refresh, and *+ Nieuwe klant* as the primary action when [ClientsActions.onAdd]
 * is given. States (`information-architecture.md §9.5`): skeleton rows while loading (and a line after 10 s), the error with
 * *Opnieuw proberen*, the empty state with its action, the list read before with its time when the connection is gone, and
 * the no-permission text.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ClientsScreen(
    state: ClientsState,
    query: String,
    refreshing: Boolean,
    workspace: WorkspaceDefaults,
    workspaceName: String,
    actions: ClientsActions,
    modifier: Modifier = Modifier,
) {
    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        stringResource(R.string.clients_title),
                        modifier = Modifier.testTag(ClientsTags.TITLE).semantics { heading() },
                    )
                },
                navigationIcon = { BackButton(ClientsTags.BACK, actions.onBack) },
            )
        },
        floatingActionButton = {
            actions.onAdd?.let { add ->
                ExtendedFloatingActionButton(
                    onClick = add,
                    modifier = Modifier.testTag(ClientsTags.ADD),
                    icon = { Icon(painterResource(R.drawable.ic_add), contentDescription = null) },
                    text = { Text(stringResource(R.string.clients_new_client)) },
                )
            }
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            if (state is ClientsState.NoAccess) {
                NoPermission(workspaceName)
                return@Column
            }
            OutlinedTextField(
                value = query,
                onValueChange = actions.onQueryChange,
                modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.space4).testTag(ClientsTags.SEARCH),
                placeholder = { Text(stringResource(R.string.clients_search_placeholder)) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            )
            if (state is ClientsState.Loaded && state.offline) Offline(state.updatedAt, workspace.zone)
            PullToRefreshBox(
                isRefreshing = refreshing,
                onRefresh = actions.onRefresh,
                modifier = Modifier.fillMaxSize(),
            ) {
                when (state) {
                    ClientsState.Loading -> Skeleton()
                    ClientsState.Failed -> LoadError(actions.onRetry)
                    is ClientsState.Loaded -> Loaded(state, query, actions.onOpen)
                    ClientsState.NoAccess -> Unit
                }
            }
        }
    }
}

@Composable
internal fun BackButton(tag: String, onBack: () -> Unit) {
    IconButton(onClick = onBack, modifier = Modifier.testTag(tag)) {
        Icon(
            painterResource(R.drawable.ic_arrow_back),
            contentDescription = stringResource(R.string.clients_profile_back),
        )
    }
}

@Composable
private fun NoPermission(workspaceName: String) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(Spacing.space6).testTag(ClientsTags.NO_PERMISSION),
        verticalArrangement = Arrangement.spacedBy(Spacing.space2),
    ) {
        Text(
            text = stringResource(R.string.no_permission_title),
            modifier = Modifier.semantics { heading() },
            style = MaterialTheme.typography.title2,
        )
        Text(text = stringResource(R.string.no_permission_body, workspaceName), style = MaterialTheme.typography.body)
    }
}

// "Je bent offline. Laatst bijgewerkt om 08:42." above the list that was read before.
@Composable
private fun Offline(updatedAt: Instant, zone: ZoneId) {
    val time = remember(updatedAt, zone) { TIME.withZone(zone).format(updatedAt) }
    Text(
        text = stringResource(R.string.clients_offline, time),
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.secondaryContainer)
            .padding(horizontal = Spacing.space4, vertical = Spacing.space2)
            .testTag(ClientsTags.OFFLINE),
        color = MaterialTheme.colorScheme.onSecondaryContainer,
        style = MaterialTheme.typography.body,
    )
}

private val TIME: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

// Skeleton rows in the shape of the list; after 10 s a line says that it takes longer than usual.
@Composable
private fun Skeleton() {
    val label = stringResource(R.string.clients_loading)
    Column(
        modifier = Modifier.fillMaxSize().padding(Spacing.space4).testTag(ClientsTags.LOADING)
            .semantics { contentDescription = label },
        verticalArrangement = Arrangement.spacedBy(Spacing.space4),
    ) {
        repeat(SKELETON_ROWS) {
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.space2)) {
                Box(Modifier.fillMaxWidth(NAME_SHARE).height(Spacing.space4).placeholder())
                Box(Modifier.fillMaxWidth(EMAIL_SHARE).height(Spacing.space3).placeholder())
            }
        }
        SlowLoadingLine(ClientsTags.LOADING_SLOW)
    }
}

@Composable
internal fun Modifier.placeholder(): Modifier =
    background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(Spacing.space1))

private const val SKELETON_ROWS = 6
private const val NAME_SHARE = 0.5f
private const val EMAIL_SHARE = 0.35f

@Composable
private fun LoadError(onRetry: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(Spacing.space6),
        verticalArrangement = Arrangement.spacedBy(Spacing.space4),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = stringResource(R.string.clients_load_error),
            modifier = Modifier.testTag(ClientsTags.ERROR),
            style = MaterialTheme.typography.body,
            textAlign = TextAlign.Center,
        )
        Button(onClick = onRetry, modifier = Modifier.testTag(ClientsTags.RETRY)) {
            Text(stringResource(R.string.common_retry))
        }
    }
}

@Composable
private fun Loaded(state: ClientsState.Loaded, query: String, onOpen: (UUID) -> Unit) {
    val listLabel = stringResource(R.string.clients_list_label)
    LazyColumn(
        modifier = Modifier.fillMaxSize().testTag(ClientsTags.LIST).semantics { contentDescription = listLabel },
        // Room under the last row for the primary action.
        contentPadding = PaddingValues(bottom = Spacing.space16 + Spacing.space8),
    ) {
        if (state.clients.isEmpty()) {
            item {
                Empty(searching = query.isNotBlank())
            }
        }
        items(state.clients, key = { it.id }) { client ->
            ClientRow(client, onOpen)
            HorizontalDivider()
        }
        if (state.total > state.clients.size) {
            item {
                Text(
                    text = stringResource(
                        R.string.clients_partial,
                        state.clients.size.toString(),
                        state.total.toString(),
                    ),
                    modifier = Modifier.padding(Spacing.space4).testTag(ClientsTags.PARTIAL),
                    style = MaterialTheme.typography.subhead,
                )
            }
        }
    }
}

// The empty state says what is missing; its action is *+ Nieuwe klant*, the one on screen.
@Composable
private fun Empty(searching: Boolean) {
    Text(
        text = stringResource(if (searching) R.string.clients_no_results else R.string.clients_empty),
        modifier = Modifier.fillMaxWidth().padding(Spacing.space6)
            .testTag(if (searching) ClientsTags.NO_RESULTS else ClientsTags.EMPTY),
        style = MaterialTheme.typography.body,
        textAlign = TextAlign.Center,
    )
}

@Composable
private fun ClientRow(client: Client, onOpen: (UUID) -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = Spacing.space12)
            .clickable { onOpen(client.id) }
            .padding(horizontal = Spacing.space4, vertical = Spacing.space3)
            .testTag("${ClientsTags.ROW}.${client.id}"),
        verticalArrangement = Arrangement.spacedBy(Spacing.space1),
    ) {
        Text(
            text = client.name,
            modifier = Modifier.testTag("${ClientsTags.ROW_NAME}.${client.id}"),
            style = MaterialTheme.typography.body,
        )
        Text(
            text = client.email,
            modifier = Modifier.testTag("${ClientsTags.ROW_EMAIL}.${client.id}"),
            style = MaterialTheme.typography.subhead,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

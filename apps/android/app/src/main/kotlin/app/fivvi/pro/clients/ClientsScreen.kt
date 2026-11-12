package app.fivvi.pro.clients

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import app.fivvi.api.models.Client
import app.fivvi.core.R
import app.fivvi.core.kit.AvatarSize
import app.fivvi.core.kit.FivviCard
import app.fivvi.core.kit.GroupGap
import app.fivvi.core.kit.InsetGroupedList
import app.fivvi.core.kit.ListRow
import app.fivvi.core.kit.PersonAvatar
import app.fivvi.core.kit.SearchField
import app.fivvi.core.kit.groupRowCorners
import app.fivvi.core.ui.LoadError
import app.fivvi.core.ui.OfflineBanner
import app.fivvi.core.ui.SlowLoadingLine
import app.fivvi.core.ui.placeholder
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.body
import app.fivvi.designtokens.subhead
import app.fivvi.designtokens.title1
import app.fivvi.designtokens.title2
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

    /** The avatar at the start of a row, `clients.rowAvatar.<id>`: decorative, with the client's initials. */
    const val ROW_AVATAR = "clients.rowAvatar"
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
 * *Klanten* / *Clients* (TM-02, F006 AC6, AC12) in the look of the prototype: the back button, the large title, the
 * pill search field (matches name and address as you type, in the API) and the list in one rounded group, a shaped avatar
 * with the name and the address on each row, with pull to refresh; *+ Nieuwe klant* is the pill action when
 * [ClientsActions.onAdd] is given. States (`information-architecture.md §9.5`): skeleton rows while loading (and a line
 * after 10 s), the error with *Opnieuw proberen*, the empty state with its action, the list read before with its time
 * when the connection is gone, and the no-permission text.
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
        floatingActionButton = {
            actions.onAdd?.let { add ->
                ExtendedFloatingActionButton(
                    onClick = add,
                    modifier = Modifier.testTag(ClientsTags.ADD),
                    shape = CircleShape,
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = MaterialTheme.colorScheme.onPrimary,
                    icon = { Icon(painterResource(R.drawable.ic_add), contentDescription = null) },
                    text = { Text(stringResource(R.string.clients_new_client)) },
                )
            }
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            BackButton(ClientsTags.BACK, actions.onBack)
            Text(
                text = stringResource(R.string.clients_title),
                modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.space5)
                    .padding(bottom = Spacing.space3).testTag(ClientsTags.TITLE).semantics { heading() },
                style = MaterialTheme.typography.title1,
            )
            if (state is ClientsState.NoAccess) {
                NoPermission(workspaceName)
                return@Column
            }
            SearchField(
                value = query,
                onValueChange = actions.onQueryChange,
                placeholder = stringResource(R.string.clients_search_placeholder),
                modifier = Modifier.padding(horizontal = Spacing.space4).testTag(ClientsTags.SEARCH),
            )
            if (state is ClientsState.Loaded &&
                state.offline
            ) {
                OfflineBanner(state.updatedAt, workspace.zone, ClientsTags.OFFLINE)
            }
            PullToRefreshBox(
                isRefreshing = refreshing,
                onRefresh = actions.onRefresh,
                modifier = Modifier.fillMaxSize(),
            ) {
                when (state) {
                    ClientsState.Loading -> Skeleton()

                    ClientsState.Failed -> LoadError(
                        R.string.clients_load_error,
                        ClientsTags.ERROR,
                        ClientsTags.RETRY,
                        actions.onRetry,
                    )

                    is ClientsState.Loaded -> Loaded(state, query, actions.onOpen)

                    ClientsState.NoAccess -> Unit
                }
            }
        }
    }
}

@Composable
internal fun BackButton(tag: String, onBack: () -> Unit) {
    IconButton(onClick = onBack, modifier = Modifier.padding(start = Spacing.space1).testTag(tag)) {
        Icon(
            painterResource(R.drawable.ic_arrow_back),
            contentDescription = stringResource(R.string.clients_profile_back),
        )
    }
}

@Composable
private fun NoPermission(workspaceName: String) {
    FivviCard(Modifier.fillMaxWidth().padding(horizontal = Spacing.space4).testTag(ClientsTags.NO_PERMISSION)) {
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.space2)) {
            Text(
                text = stringResource(R.string.no_permission_title),
                modifier = Modifier.semantics { heading() },
                style = MaterialTheme.typography.title2,
            )
            Text(
                text = stringResource(R.string.no_permission_body, workspaceName),
                style = MaterialTheme.typography.body,
            )
        }
    }
}

// Skeleton rows in the shape of the list (an avatar, a name and an address in one group); after 10 s a line says that it
// takes longer than usual.
@Composable
private fun Skeleton() {
    val label = stringResource(R.string.clients_loading)
    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = Spacing.space4)
            .testTag(ClientsTags.LOADING).semantics { contentDescription = label },
        verticalArrangement = Arrangement.spacedBy(Spacing.space4),
    ) {
        InsetGroupedList {
            repeat(SKELETON_ROWS) {
                row {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(
                            horizontal = Spacing.space4,
                            vertical = Spacing.space3,
                        ),
                        horizontalArrangement = Arrangement.spacedBy(Spacing.space3),
                    ) {
                        Box(Modifier.size(AvatarSize).placeholder())
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(Spacing.space2)) {
                            Box(Modifier.fillMaxWidth(NAME_SHARE).height(Spacing.space4).placeholder())
                            Box(Modifier.fillMaxWidth(EMAIL_SHARE).height(Spacing.space3).placeholder())
                        }
                    }
                }
            }
        }
        SlowLoadingLine(ClientsTags.LOADING_SLOW)
    }
}

private const val SKELETON_ROWS = 6
private const val NAME_SHARE = 0.5f
private const val EMAIL_SHARE = 0.7f

// The clients in one group: the rows are cards 2 dp apart, the first and the last with the outer corners (the kit's
// InsetGroupedList, drawn lazily here because the list can be long).
@Composable
private fun Loaded(state: ClientsState.Loaded, query: String, onOpen: (UUID) -> Unit) {
    val listLabel = stringResource(R.string.clients_list_label)
    LazyColumn(
        modifier = Modifier.fillMaxSize().testTag(ClientsTags.LIST).semantics { contentDescription = listLabel },
        // Room under the last row for the primary action.
        contentPadding = PaddingValues(
            start = Spacing.space4,
            end = Spacing.space4,
            top = Spacing.space3,
            bottom = Spacing.space16 + Spacing.space8,
        ),
        verticalArrangement = Arrangement.spacedBy(GroupGap),
    ) {
        if (state.clients.isEmpty()) {
            item {
                Empty(searching = query.isNotBlank())
            }
        }
        itemsIndexed(state.clients, key = { _, client -> client.id }) { index, client ->
            ClientRow(client, groupRowCorners(index, state.clients.size).shape, onOpen)
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
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.subhead,
                )
            }
        }
    }
}

// The empty state says what is missing, on a card; its action is *+ Nieuwe klant*, the one on screen.
@Composable
private fun Empty(searching: Boolean) {
    FivviCard(Modifier.fillMaxWidth()) {
        Text(
            text = stringResource(if (searching) R.string.clients_no_results else R.string.clients_empty),
            modifier = Modifier.fillMaxWidth().padding(vertical = Spacing.space2)
                .testTag(if (searching) ClientsTags.NO_RESULTS else ClientsTags.EMPTY),
            style = MaterialTheme.typography.body,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun ClientRow(client: Client, shape: androidx.compose.ui.graphics.Shape, onOpen: (UUID) -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = shape,
        color = MaterialTheme.colorScheme.surfaceContainerLowest,
        contentColor = MaterialTheme.colorScheme.onSurface,
    ) {
        ListRow(
            title = client.name,
            subtitle = client.email,
            modifier = Modifier.testTag("${ClientsTags.ROW}.${client.id}"),
            leading = { PersonAvatar(client.name, Modifier.testTag("${ClientsTags.ROW_AVATAR}.${client.id}")) },
            onClick = { onOpen(client.id) },
            titleModifier = Modifier.testTag("${ClientsTags.ROW_NAME}.${client.id}"),
            subtitleModifier = Modifier.testTag("${ClientsTags.ROW_EMAIL}.${client.id}"),
        )
    }
}

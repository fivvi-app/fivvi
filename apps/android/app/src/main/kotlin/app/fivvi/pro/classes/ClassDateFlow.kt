package app.fivvi.pro.classes

import androidx.activity.compose.BackHandler
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.fivvi.api.models.MeWorkspace
import app.fivvi.core.net.Connectivity
import app.fivvi.core.ui.OnForeground
import app.fivvi.pro.capabilities.WorkspaceCapabilities
import java.util.UUID

/**
 * TD-03 (F021): the screen of one class on a date. System back leaves it. *Les wijzigen* shows for whoever the API lists
 * `class.manage` for in the workspace (F004 AC10). [added] is set when TD-05 has just created the date (the number of
 * dates it added): "Groepsles toegevoegd" or "12 groepslessen toegevoegd" shows. [sessionKey] belongs to one sign-in and
 * [opening] to one opening of the screen, so each opening reads the date again. *Les annuleren* (F026) shows for whoever may
 * manage classes, is off while [connectivity] says the phone is offline, and tells [onCancelled] once the date is cancelled, so
 * Vandaag and Agenda read again.
 */
@Composable
fun ClassDateFlow(
    apis: ClassApis,
    capabilities: WorkspaceCapabilities,
    workspaceId: UUID,
    workspaceName: String,
    sessionId: UUID,
    teamMemberId: UUID,
    added: Int?,
    sessionKey: String,
    opening: Int,
    onBack: () -> Unit,
    connectivity: Connectivity,
    onCancelled: () -> Unit,
) {
    val allowed by capabilities.capabilities.collectAsStateWithLifecycle()
    val canManage = allowed.mayShow(workspaceId, MeWorkspace.Capabilities.CLASS_PERIOD_MANAGE)
    val model = viewModel(key = "classDate-$sessionKey-$workspaceId-$sessionId-$opening") {
        ClassDateViewModel(
            apis,
            workspaceId,
            sessionId,
            teamMemberId,
            canManage = canManage,
            added = added,
            isOnline = { connectivity.online.value },
            onCancelled = onCancelled,
            onNotAllowed = { capabilities.onResponse(it, workspaceId, MeWorkspace.Capabilities.CLASS_PERIOD_READ) },
            onCancelNotAllowed = {
                capabilities.onResponse(it, workspaceId, MeWorkspace.Capabilities.CLASS_PERIOD_MANAGE)
            },
        )
    }
    val state by model.state.collectAsStateWithLifecycle()
    val online by connectivity.online.collectAsStateWithLifecycle()

    // On foreground the date is read again: a change made elsewhere shows.
    OnForeground(model::refresh)
    BackHandler(onBack = onBack)
    // The menu follows what the API lists now: a 403 elsewhere takes it away.
    ClassDateScreen(
        state.copy(canManage = canManage, online = online),
        workspaceName,
        ClassDateActions(
            onBack = onBack,
            onRetry = model::retry,
            onToggleDescription = model::toggleDescription,
            onEdit = model::editTapped,
            onCancel = model::askToCancel,
            onConfirmCancel = model::confirmCancel,
            onDismissCancel = model::dismissCancel,
        ),
    )
}

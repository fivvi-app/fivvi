package app.fivvi.pro.attendance

import androidx.activity.compose.BackHandler
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.fivvi.api.apis.SessionsApi
import app.fivvi.api.models.MeWorkspace
import app.fivvi.core.ui.OnForeground
import app.fivvi.pro.capabilities.WorkspaceCapabilities
import app.fivvi.pro.personal.rememberTicking
import java.time.Instant
import java.util.UUID

/**
 * CO-05 (F025): the attendance of one class date, from TD-03's *Aanwezigheid invullen* or the line of an ended class on Vandaag.
 * System back leaves it. [sessionKey] belongs to one sign-in and [opening] to one opening of the screen, so each opening reads
 * the participants again; they are read again on foreground, and when the API refused a request of the queue (the row has
 * reverted, the screen shows what the API has). [now] is the clock the window is judged by.
 */
@Composable
fun AttendanceFlow(
    api: SessionsApi,
    queue: AttendanceQueue,
    capabilities: WorkspaceCapabilities,
    workspaceId: UUID,
    workspaceName: String,
    sessionId: UUID,
    sessionKey: String,
    opening: Int,
    onBack: () -> Unit,
    now: () -> Instant,
) {
    val model = viewModel(key = "attendance-$sessionKey-$workspaceId-$sessionId-$opening") {
        AttendanceViewModel(
            api,
            workspaceId,
            sessionId,
            queue,
            now,
            onForbidden = {
                capabilities.forbidden(workspaceId, MeWorkspace.Capabilities.ATTENDANCE_PERIOD_MARK_PERIOD_ANY)
            },
            withHeader = true,
        )
    }
    val state by model.state.collectAsStateWithLifecycle()
    val queued by queue.state.collectAsStateWithLifecycle()
    val at = rememberTicking(now)
    val view = model.view(queued, at)
    OnForeground(model::refresh)
    LaunchedEffect(view.refusals) { if (view.refusals > 0) model.refresh() }
    BackHandler(onBack = onBack)
    AttendanceScreen(
        state,
        view,
        workspaceName,
        AttendanceActions(
            onBack = onBack,
            onRetry = model::retry,
            onToggle = { clientId, status -> model.toggle(status, clientId) },
            onEveryone = model::markEveryone,
        ),
    )
}

package app.fivvi.pro.sessions

import androidx.activity.compose.BackHandler
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.fivvi.api.models.MeWorkspace
import app.fivvi.core.ui.OnForeground
import app.fivvi.pro.capabilities.WorkspaceCapabilities
import java.util.UUID

/**
 * TD-02 and PS-05 (F020): the screen of one private session and, over it, *Verplaatsen*. System back closes the form of PS-05
 * first, then the screen. [onOpenClient] opens the client's profile, [onRoute] the maps app with the URL it is given;
 * *Verplaatsen* shows only while [capabilities] lists `session.private.manage.own` or `.any` for the workspace (F004 AC10).
 * [sessionKey] belongs to one sign-in and [opening] to one opening of the screen, so each opening reads the session again.
 */
@Composable
fun SessionFlow(
    apis: SessionApis,
    capabilities: WorkspaceCapabilities,
    workspaceId: UUID,
    workspaceName: String,
    sessionId: UUID,
    mayReadTeam: Boolean,
    email: String,
    accountName: String?,
    sessionKey: String,
    opening: Int,
    onBack: () -> Unit,
    onOpenClient: (UUID) -> Unit,
    onRoute: (String) -> Unit,
) {
    val own = MeWorkspace.Capabilities.SESSION_PERIOD_PRIVATE_PERIOD_MANAGE_PERIOD_OWN
    val any = MeWorkspace.Capabilities.SESSION_PERIOD_PRIVATE_PERIOD_MANAGE_PERIOD_ANY
    val model = viewModel(key = "session-$sessionKey-$workspaceId-$sessionId-$opening") {
        SessionViewModel(
            apis,
            workspaceId,
            sessionId,
            mayReadTeam,
            email,
            accountName,
            onNotAllowed = { capabilities.onResponse(it, workspaceId, MeWorkspace.Capabilities.CLIENTS_PERIOD_VIEW) },
        )
    }
    val state by model.state.collectAsStateWithLifecycle()
    val allowed by capabilities.capabilities.collectAsStateWithLifecycle()
    val mayMove = allowed.mayShow(workspaceId, own) || allowed.mayShow(workspaceId, any)
    var rescheduling by rememberSaveable { mutableStateOf(false) }
    var openings by rememberSaveable { mutableIntStateOf(0) }

    // On foreground the session is read again: a change made elsewhere shows.
    OnForeground(model::refresh)

    val session = state.session
    if (rescheduling && session != null && state.client != null) {
        val client = state.client
        val form = viewModel(key = "reschedule-$sessionKey-$workspaceId-$sessionId-$opening-$openings") {
            RescheduleViewModel(
                apis.sessions,
                workspaceId,
                session,
                state.emailLocale,
                state.myTrainerId,
                onNotAllowed = { capabilities.onResponse(it, workspaceId, own) },
            )
        }
        val shown by form.state.collectAsStateWithLifecycle()
        fun close() {
            rescheduling = false
            model.refresh()
        }
        BackHandler(onBack = ::close)
        LaunchedEffect(shown.moved) {
            shown.moved?.let {
                form.onMovedHandled()
                model.didMove(it)
                rescheduling = false
            }
        }
        RescheduleScreen(
            shown,
            client?.name.orEmpty(),
            form.emailLocale,
            RescheduleActions(
                onClose = ::close,
                onSubmit = { form.save() },
                onSaveAnyway = { form.save(allowConflicts = true) },
                onDismissDoubleBooking = form::dismissDoubleBooking,
                onNotify = form::setNotify,
                time = SessionTimeActions(
                    onDate = form::setDate,
                    onStart = form::setStart,
                    onChooseDuration = form::chooseDuration,
                    onOtherDuration = form::setOtherDuration,
                ),
            ),
        )
        return
    }
    BackHandler(onBack = onBack)
    SessionScreen(
        state,
        workspaceName,
        SessionActions(
            onBack = onBack,
            onRetry = model::retry,
            onReschedule = if (mayMove) {
                {
                    openings++
                    rescheduling = true
                }
            } else {
                null
            },
            onOpenClient = onOpenClient,
            onRoute = onRoute,
        ),
    )
}

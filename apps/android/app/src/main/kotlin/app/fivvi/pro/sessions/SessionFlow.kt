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
import app.fivvi.core.net.Connectivity
import app.fivvi.core.ui.OnForeground
import app.fivvi.pro.attendance.AttendanceLoad
import app.fivvi.pro.attendance.AttendanceQueue
import app.fivvi.pro.attendance.AttendanceSection
import app.fivvi.pro.attendance.AttendanceViewModel
import app.fivvi.pro.capabilities.WorkspaceCapabilities
import app.fivvi.pro.personal.PersonalRows
import app.fivvi.pro.personal.rememberTicking
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

/**
 * TD-02, PS-05 and PS-06 (F020, F026): the screen of one private session and, over it, *Verplaatsen* and *Annuleren*. System
 * back closes the form of PS-05 or PS-06 first, then the screen. *Annuleren* shows while [capabilities] lists
 * `session.private.cancel.any` (the Owner) or `.own` (a Trainer, for a session of their own) for the workspace, and is off
 * while [connectivity] says the phone is offline (nothing is queued); [onCancelled] is told once a session is cancelled, so
 * Vandaag and Agenda read again; [now] is the clock, since a session that has started sends no email. [onOpenClient] opens
 * the client's profile, [onRoute] the maps app with the URL it is given;
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
    teamMemberId: UUID,
    sessionKey: String,
    opening: Int,
    onBack: () -> Unit,
    onOpenClient: (UUID) -> Unit,
    onRoute: (String) -> Unit,
    connectivity: Connectivity,
    onCancelled: () -> Unit,
    now: () -> Instant = Instant::now,
    /** The offline queue of attendance (F025); `null` where the screen has none: TD-02 then shows no *Aanwezigheid* section. */
    attendanceQueue: AttendanceQueue? = null,
) {
    val own = MeWorkspace.Capabilities.SESSION_PERIOD_PRIVATE_PERIOD_MANAGE_PERIOD_OWN
    val any = MeWorkspace.Capabilities.SESSION_PERIOD_PRIVATE_PERIOD_MANAGE_PERIOD_ANY
    val model = viewModel(key = "session-$sessionKey-$workspaceId-$sessionId-$opening") {
        SessionViewModel(
            apis,
            workspaceId,
            sessionId,
            teamMemberId,
            onNotAllowed = { capabilities.onResponse(it, workspaceId, MeWorkspace.Capabilities.CLIENTS_PERIOD_VIEW) },
        )
    }
    val attendance = attendanceQueue?.let { queue ->
        viewModel(key = "session-attendance-$sessionKey-$workspaceId-$sessionId-$opening") {
            AttendanceViewModel(
                apis.sessions,
                workspaceId,
                sessionId,
                queue,
                now,
                onForbidden = {
                    capabilities.forbidden(workspaceId, MeWorkspace.Capabilities.ATTENDANCE_PERIOD_MARK_PERIOD_ANY)
                },
            )
        }
    }
    val state by model.state.collectAsStateWithLifecycle()
    val allowed by capabilities.capabilities.collectAsStateWithLifecycle()
    val mayMove = allowed.mayShow(workspaceId, own) || allowed.mayShow(workspaceId, any)
    val cancelAny = MeWorkspace.Capabilities.SESSION_PERIOD_PRIVATE_PERIOD_CANCEL_PERIOD_ANY
    val cancelOwn = MeWorkspace.Capabilities.SESSION_PERIOD_PRIVATE_PERIOD_CANCEL_PERIOD_OWN
    val online by connectivity.online.collectAsStateWithLifecycle()
    var rescheduling by rememberSaveable { mutableStateOf(false) }
    var cancelling by rememberSaveable { mutableStateOf(false) }
    var openings by rememberSaveable { mutableIntStateOf(0) }
    var cancelOpenings by rememberSaveable { mutableIntStateOf(0) }

    // On foreground the session is read again: a change made elsewhere shows.
    OnForeground {
        model.refresh()
        attendance?.refresh()
    }
    // A cancelled session has no attendance to take: the section reads again and shows why.
    LaunchedEffect(state.isCancelled) { if (state.isCancelled) attendance?.refresh() }

    // What the person may do and the phone's connection are the screen's own to show; the model holds what was read.
    val shown = state.copy(
        mayCancelAny = allowed.mayShow(workspaceId, cancelAny),
        mayCancelOwn = allowed.mayShow(workspaceId, cancelOwn),
        online = online,
    )
    val session = state.session
    if (cancelling && session != null && state.client != null) {
        val client = state.client
        val form = viewModel(key = "cancel-$sessionKey-$workspaceId-$sessionId-$opening-$cancelOpenings") {
            CancelSessionViewModel(
                apis.sessions,
                workspaceId,
                session,
                client?.name.orEmpty(),
                state.clientRecord?.email,
                state.emailLocale,
                canReschedule = mayMove,
                now = now(),
                onNotAllowed = { capabilities.onResponse(it, workspaceId, cancelOwn) },
            )
        }
        val cancelState by form.state.collectAsStateWithLifecycle()
        fun close() {
            if (cancelState.isOffline) model.cancelWasOffline()
            cancelling = false
            model.refresh()
            attendance?.refresh()
        }
        BackHandler(onBack = ::close)
        LaunchedEffect(cancelState.cancelled) {
            cancelState.cancelled?.let {
                form.onCancelledHandled()
                model.didCancel(it)
                cancelling = false
                onCancelled()
            }
        }
        CancelSessionScreen(
            cancelState,
            CancelSessionActions(
                onChoose = form::choose,
                onNotify = form::setNotify,
                onCancelAnyway = form::cancelAnyway,
                onReschedule = {
                    cancelling = false
                    openings++
                    rescheduling = true
                },
                onSubmit = form::cancel,
                onBack = ::close,
            ),
        )
        return
    }
    if (rescheduling && session != null && state.client != null) {
        val client = state.client
        val form = viewModel(key = "reschedule-$sessionKey-$workspaceId-$sessionId-$opening-$openings") {
            RescheduleViewModel(
                apis.sessions,
                workspaceId,
                session,
                state.emailLocale,
                state.myTeamMemberId,
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
    val attended = attendance?.state?.collectAsStateWithLifecycle()?.value
    val queued = attendanceQueue?.state?.collectAsStateWithLifecycle()?.value
    val at = rememberTicking(now)
    val attendanceView = if (attendance != null && attended != null &&
        queued != null
    ) {
        attendance.view(queued, at)
    } else {
        null
    }
    // A request the API refused reverted its row: what it has now is read again.
    LaunchedEffect(attendanceView?.refusals) { if ((attendanceView?.refusals ?: 0) > 0) attendance?.refresh() }
    val section: (@Composable () -> Unit)? = attendanceView?.let { view ->
        {
            AttendanceSection(
                view,
                loaded = attended?.load == AttendanceLoad.Loaded,
                zone = session?.let { runCatching { ZoneId.of(it.timeZone) }.getOrNull() } ?: PersonalRows.TIME_ZONE,
                onSet = { clientId, status -> attendance?.set(status, clientId) },
            )
        }
    }
    SessionScreen(
        shown,
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
            onCancel = {
                cancelOpenings++
                cancelling = true
            },
        ),
        attendance = section,
    )
}

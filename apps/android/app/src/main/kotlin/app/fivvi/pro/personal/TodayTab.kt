package app.fivvi.pro.personal

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.fivvi.core.ui.OnForeground
import app.fivvi.pro.attendance.AttendanceQueue
import app.fivvi.pro.attendance.QueueAction
import app.fivvi.pro.attendance.QueueState
import java.time.DateTimeException
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneId
import java.util.TimeZone

/**
 * The zone a time-zone broadcast names. An ID the app can't read (the OS may send one the runtime's list lacks) is not worth a
 * crash: the phone's own zone is used, as for a broadcast without one.
 */
internal fun zoneOf(id: String?): ZoneId = try {
    id?.let { ZoneId.of(it, ZoneId.SHORT_IDS) }
} catch (_: DateTimeException) {
    null
} ?: TimeZone.getDefault().toZoneId()

/**
 * The phone's own time zone, as it changes (a trip, the clock set by the network): Vandaag shows the hint that times are
 * Dutch only while the phone is on another clock than Amsterdam's (F013 AC14). [onTimeChanged] is told each time the OS says
 * the time, the date or the zone changed, so Vandaag reads the day again (midnight rolls it over).
 */
@Composable
fun rememberDeviceZone(onTimeChanged: () -> Unit): ZoneId {
    val context = LocalContext.current
    var zone by remember { mutableStateOf(ZoneId.systemDefault()) }
    val changed by rememberUpdatedState(onTimeChanged)
    DisposableEffect(context) {
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                if (intent.action == Intent.ACTION_TIMEZONE_CHANGED) {
                    zone = zoneOf(intent.getStringExtra(Intent.EXTRA_TIMEZONE))
                }
                changed()
            }
        }
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_TIMEZONE_CHANGED)
            addAction(Intent.ACTION_TIME_CHANGED)
            addAction(Intent.ACTION_DATE_CHANGED)
        }
        // Only the system sends these, and only this app's screen listens while it is shown.
        ContextCompat.registerReceiver(context, receiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
        onDispose { context.unregisterReceiver(receiver) }
    }
    return zone
}

/**
 * The first tab (F013): Vandaag reads the day on opening, on foreground (with the account, so a workspace the person lost
 * shows its notice) and on the OS's time-change signals, and holds its own countdown. [onPlan] is `null` where the person may
 * not plan sessions in the current workspace. [studio] holds the Owner's *Mijn dag | Hele studio* (F014): it is read on the same
 * occasions, and [studioWorkspace] is the workspace it is of (`null` while the account isn't read).
 */
@Composable
fun TodayTab(
    model: TodayViewModel,
    studio: StudioDayViewModel,
    studioWorkspace: StudioWorkspace?,
    onOpen: (PersonalRow) -> Unit,
    onRoute: (String) -> Unit,
    onPlan: ((OffsetDateTime) -> Unit)?,
    onOpenTomorrow: (String) -> Unit,
    menu: @Composable (offline: Boolean) -> Unit,
    modifier: Modifier = Modifier,
    /** The offline queue of attendance (F025): the nudges follow it and a tap on one goes through it; `null` shows none. */
    attendance: AttendanceQueue? = null,
    /** The line *Aanwezigheid nog invullen* of an ended class opens CO-05. */
    onOpenAttendance: (PersonalRow) -> Unit = {},
) {
    val state by model.state.collectAsStateWithLifecycle()
    val queued = attendance?.state?.collectAsStateWithLifecycle()?.value ?: QueueState()
    val studioState by studio.state.collectAsStateWithLifecycle()
    val zone = rememberDeviceZone {
        model.load()
        if (studio.state.value.isStudio) studio.load()
    }
    val now: Instant = rememberTicking(model::now)
    LaunchedEffect(model) { model.load() }
    OnForeground(model::refresh)
    OnForeground(studio::refresh)
    TodayScreen(
        state,
        TodayActions(
            onRefresh = {
                model.refresh()
                studio.refresh()
            },
            onOpen = onOpen,
            onRoute = onRoute,
            onPlan = onPlan,
            onOpenTomorrow = onOpenTomorrow,
            onDismissNotices = model::dismissNotices,
            menu = menu,
            onMark = { row, status ->
                // A nudge marks the client of its row.
                row.nudge?.let {
                    attendance?.enqueue(row.workspaceId, row.id, QueueAction.Set(it.clientId, status))
                }
            },
            onOpenAttendance = onOpenAttendance,
            onDismissDroppedTaps = { attendance?.dismissDroppedTaps() },
        ),
        deviceZone = zone,
        now = now,
        modifier = modifier,
        studio = studioWorkspace?.let { StudioUi(studioState, it, studio::select) },
        queue = queued,
    )
}

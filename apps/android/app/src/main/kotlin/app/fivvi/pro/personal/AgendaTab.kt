package app.fivvi.pro.personal

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.fivvi.core.ui.OnForeground
import java.time.Instant

/**
 * The second tab (F013, TD-04): Agenda reads the days on screen on opening and whenever another week or month is shown (not
 * for another day or view of the same days: one request per range), on the foreground and on the OS's time-change signals,
 * and holds its own now-line. [menu] is the **+** of the bar, as on Vandaag.
 */
@Composable
fun AgendaTab(
    model: AgendaViewModel,
    onOpen: (PersonalRow) -> Unit,
    onRoute: (String) -> Unit,
    menu: @Composable (offline: Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    val state by model.state.collectAsStateWithLifecycle()
    val zone = rememberDeviceZone { model.load() }
    val now: Instant = rememberTicking(model::now)
    // The days on screen: one request for them, and another only when the view shows other days.
    LaunchedEffect(model, state.range) { model.load() }
    OnForeground(model::load)
    AgendaScreen(
        state,
        AgendaActions(
            onRefresh = model::refresh,
            onShow = model::show,
            onSelect = model::select,
            onStepWeek = model::stepWeek,
            onStepMonth = model::stepMonth,
            onToday = model::goToToday,
            onOpen = onOpen,
            onRoute = onRoute,
            menu = menu,
        ),
        deviceZone = zone,
        now = now,
        modifier = modifier,
    )
}

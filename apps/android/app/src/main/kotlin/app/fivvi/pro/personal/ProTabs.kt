package app.fivvi.pro.personal

import androidx.annotation.DrawableRes
import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import app.fivvi.core.R as CoreR
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.title1
import app.fivvi.pro.R

/**
 * The tabs of Fivvi Pro (F013, `information-architecture.md §5.1`): Vandaag first, then Agenda, then the home of the
 * current workspace (*Klanten*, *Profiel*, the account) until those become tabs of their own. The tags are the ids of the
 * iOS tab bar, which the Maestro flows share.
 */
enum class ProTab(@StringRes val label: Int, @DrawableRes val icon: Int, val tag: String) {
    TODAY(CoreR.string.my_day_app_tab, R.drawable.ic_tab_today, "tab.today"),
    CALENDAR(CoreR.string.my_calendar_app_tab, R.drawable.ic_tab_calendar, "tab.calendar"),
    HOME(CoreR.string.home_tab, R.drawable.ic_tab_home, "tab.home"),
}

/** Test tags of the tab bar. */
object TabTags {
    const val BAR = "tabs"
}

/**
 * The frame of the signed-in app: the Material 3 [NavigationBar] with the three tabs, and [content] of the [selected] one
 * above it. Screens that open from a tab (TD-02, TD-03, PS-04, Klanten, Profiel) are drawn over the whole frame, so they
 * hide the bar, as the system's own apps do.
 */
@Composable
fun ProTabs(selected: ProTab, onSelect: (ProTab) -> Unit, content: @Composable (ProTab) -> Unit) {
    val barLabel = stringResource(CoreR.string.client_nav_label)
    Scaffold(
        modifier = Modifier.fillMaxSize(),
        bottomBar = {
            NavigationBar(Modifier.testTag(TabTags.BAR).semantics { contentDescription = barLabel }) {
                ProTab.entries.forEach { tab ->
                    NavigationBarItem(
                        selected = tab == selected,
                        onClick = { onSelect(tab) },
                        icon = { Icon(painterResource(tab.icon), contentDescription = null) },
                        label = { Text(stringResource(tab.label)) },
                        modifier = Modifier.testTag(tab.tag),
                    )
                }
            }
        },
    ) { padding ->
        // The screens inside lay themselves out by the system bars (safeDrawingPadding): what the frame has used is consumed.
        Box(Modifier.fillMaxSize().padding(padding).consumeWindowInsets(padding)) { content(selected) }
    }
}

/** The id of the title of the *Agenda* tab, the same as on iOS. */
const val CALENDAR_TITLE_TAG = "calendar.title"

/** TD-04 *Agenda*: the week and the month come with their own ticket (#527); until then the tab is its title only. */
@Composable
fun CalendarPlaceholder(modifier: Modifier = Modifier) {
    Text(
        text = stringResource(CoreR.string.my_calendar_app_title),
        modifier = modifier.fillMaxSize().padding(Spacing.space4).testTag(CALENDAR_TITLE_TAG).semantics { heading() },
        style = MaterialTheme.typography.title1,
    )
}

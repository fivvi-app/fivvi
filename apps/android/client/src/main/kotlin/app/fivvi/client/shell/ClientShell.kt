package app.fivvi.client.shell

import androidx.annotation.DrawableRes
import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
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
import androidx.compose.ui.semantics.semantics
import app.fivvi.client.R
import app.fivvi.core.R as CoreR
import app.fivvi.core.ui.OfflineNotice

/** The tabs of the client app (PRODUCT.md §55): *Home · Boeken · Profiel*. *Training* comes with M7. */
enum class Tab(@StringRes val label: Int, @DrawableRes val icon: Int, val tag: String) {
    HOME(CoreR.string.client_nav_home, R.drawable.ic_tab_home, "client.tab.home"),
    BOOK(CoreR.string.client_nav_book, R.drawable.ic_tab_book, "client.tab.book"),
    PROFILE(CoreR.string.client_nav_profile, R.drawable.ic_tab_profile, "client.tab.profile"),
}

/** Test tags, shared with the iOS accessibility identifiers and the Maestro flows. */
object ShellTags {
    const val TABS = "client.tabs"
    const val OFFLINE = "client.offline"
}

/**
 * The frame of the client app: the Material 3 [NavigationBar] with the three tabs, and above the tab's [content] the
 * offline banner while the phone is not [online] (AC9). The shell queues nothing while offline; a later feature decides
 * what it sends.
 */
@Composable
fun ClientShell(online: Boolean, selected: Tab, onSelect: (Tab) -> Unit, content: @Composable (Tab) -> Unit) {
    val tabsLabel = stringResource(CoreR.string.client_nav_label)
    Scaffold(
        modifier = Modifier.fillMaxSize(),
        bottomBar = {
            NavigationBar(Modifier.testTag(ShellTags.TABS).semantics { contentDescription = tabsLabel }) {
                Tab.entries.forEach { tab ->
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
        Column(Modifier.fillMaxSize().padding(padding)) {
            if (!online) OfflineNotice(ShellTags.OFFLINE)
            content(selected)
        }
    }
}

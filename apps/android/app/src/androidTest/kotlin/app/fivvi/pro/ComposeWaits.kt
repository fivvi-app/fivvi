package app.fivvi.pro

import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.ComposeTestRule

/** How long a UI test waits for something that happens off the main thread (the token is stored or deleted there). */
const val UI_TIMEOUT_MILLIS = 5_000L

/** Waits until a node with [tag] is on screen. */
fun ComposeTestRule.waitUntilTagExists(tag: String) = waitUntil(UI_TIMEOUT_MILLIS) {
    onAllNodes(hasTestTag(tag)).fetchSemanticsNodes().isNotEmpty()
}

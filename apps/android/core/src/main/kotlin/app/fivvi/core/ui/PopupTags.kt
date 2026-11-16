package app.fivvi.core.ui

import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId

/**
 * Test tags are resource IDs for Maestro (the activity's root sets it, so both apps' flows find an element by the id the iOS
 * app gives it). A menu or a dialog is a window of its own, outside that root: put this on its `modifier`, so the tags inside
 * it are IDs too.
 */
fun Modifier.testTagsAsIds(): Modifier = semantics { testTagsAsResourceId = true }

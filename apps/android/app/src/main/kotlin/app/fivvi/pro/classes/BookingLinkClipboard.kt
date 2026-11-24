package app.fivvi.pro.classes

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context

/**
 * Puts [text], a booking link's short URL (F037), on the phone's clipboard; [label] names it for the system (the
 * name of the action, from the catalog). Nothing is kept anywhere else.
 */
fun copyToClipboard(context: Context, label: String, text: String) {
    val clipboard = context.getSystemService(ClipboardManager::class.java) ?: return
    clipboard.setPrimaryClip(ClipData.newPlainText(label, text))
}

package app.fivvi.client.links

import android.content.Context
import android.content.Intent
import android.net.Uri

/** Opens an address in the phone's browser. Tests replace it. */
fun interface Browser {
    fun open(url: String)
}

/**
 * The default browser, never this app: a plain VIEW intent for `https://fivvi.app/j/...` would come straight back to
 * Fivvi, which owns that link. The browser selector (`CATEGORY_APP_BROWSER`) starts the browser itself.
 */
class AndroidBrowser(private val context: Context) : Browser {
    override fun open(url: String) {
        val intent = Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, Intent.CATEGORY_APP_BROWSER)
            .setData(Uri.parse(url))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            context.startActivity(intent)
        } catch (_: android.content.ActivityNotFoundException) {
            // No browser on the phone: nothing to open.
        }
    }
}

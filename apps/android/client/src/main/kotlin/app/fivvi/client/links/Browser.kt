package app.fivvi.client.links

import android.content.Context
import android.content.Intent
import android.net.Uri

/** Opens an address in the phone's browser. Tests replace it. */
fun interface Browser {
    fun open(url: String)
}

/**
 * The intent that opens [url] in the default browser, never this app: a plain VIEW intent for `https://fivvi.app/j/...`
 * would come straight back to Fivvi, which owns that link. Its selector (`ACTION_MAIN` with `CATEGORY_APP_BROWSER`) limits
 * the target to browser apps, and the VIEW intent carries the address.
 */
fun browserIntent(url: String): Intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
    selector = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_APP_BROWSER)
    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
}

class AndroidBrowser(private val context: Context) : Browser {
    override fun open(url: String) {
        try {
            context.startActivity(browserIntent(url))
        } catch (_: android.content.ActivityNotFoundException) {
            // No browser on the phone: nothing to open.
        }
    }
}

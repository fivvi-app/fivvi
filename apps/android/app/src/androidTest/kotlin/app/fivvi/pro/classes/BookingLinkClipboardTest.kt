package app.fivvi.pro.classes

import android.content.ClipboardManager
import android.content.Context
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

// F037 AC8: the short link reaches the phone's own clipboard.
class BookingLinkClipboardTest {
    // The rule's activity has the focus: from Android 10 only the app in the foreground may read the clipboard.
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun test_F037_AC8_theShortLinkIsOnThePhonesClipboard() {
        val context = ApplicationProvider.getApplicationContext<Context>()

        compose.runOnUiThread { copyToClipboard(context, "Boekingslink delen", "https://fivvi.app/l/ab12cd34") }

        var held: String? = null
        compose.runOnUiThread {
            held = context.getSystemService(ClipboardManager::class.java).primaryClip?.getItemAt(0)?.text?.toString()
        }
        assertEquals("https://fivvi.app/l/ab12cd34", held)
    }
}

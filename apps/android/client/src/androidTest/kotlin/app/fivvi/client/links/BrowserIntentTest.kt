package app.fivvi.client.links

import android.content.Intent
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

// E017 #506: *Openen in de browser* must not come back to Fivvi, which owns the link: the intent is a VIEW of the address
// whose selector is the browser app, and it starts a new task.
@RunWith(AndroidJUnit4::class)
class BrowserIntentTest {
    @Test
    fun E017_AC6_theBrowserIntentViewsTheAddressThroughTheBrowserSelector() {
        val intent = browserIntent("https://fivvi.app/j/ABCD2345")

        assertEquals(Intent.ACTION_VIEW, intent.action)
        assertEquals("https://fivvi.app/j/ABCD2345", intent.dataString)
        assertTrue(intent.flags and Intent.FLAG_ACTIVITY_NEW_TASK != 0)
        val selector = intent.selector
        assertNotNull(selector)
        assertEquals(Intent.ACTION_MAIN, selector?.action)
        assertTrue(selector?.categories.orEmpty().contains(Intent.CATEGORY_APP_BROWSER))
    }
}

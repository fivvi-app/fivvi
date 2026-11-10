package app.fivvi.client

import androidx.test.core.app.ApplicationProvider
import app.fivvi.core.R
import org.junit.Assert.assertEquals
import org.junit.Test

// E017 AC4 (#469): the name under the app icon is app.title from packages/i18n, Fivvi in both languages, and the app is
// `app.fivvi`: not Fivvi Pro (`app.name`, `app.fivvi.pro`).
class AppLabelTest {
    @Test
    fun E017_AC4_appLabelIsFivviAndTheApplicationIdIsAppFivvi() {
        val app = ApplicationProvider.getApplicationContext<ClientApplication>()

        assertEquals(app.getString(R.string.app_title), app.applicationInfo.loadLabel(app.packageManager).toString())
        assertEquals(R.string.app_title, app.applicationInfo.labelRes)
        assertEquals("Fivvi", app.getString(R.string.app_title))
        assertEquals("app.fivvi", app.packageName)
    }
}

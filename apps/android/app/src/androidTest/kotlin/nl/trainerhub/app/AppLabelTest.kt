package nl.trainerhub.app

import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Test

// AC8: the name under the app icon is app.name from packages/i18n.
class AppLabelTest {
    @Test
    fun E008_AC8_appLabelIsAppName() {
        val app = ApplicationProvider.getApplicationContext<TrainerHubApplication>()

        assertEquals(app.getString(R.string.app_name), app.applicationInfo.loadLabel(app.packageManager).toString())
        assertEquals(R.string.app_name, app.applicationInfo.labelRes)
    }
}

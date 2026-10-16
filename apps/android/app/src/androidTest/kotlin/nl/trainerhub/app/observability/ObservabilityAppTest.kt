package nl.trainerhub.app.observability

import android.content.pm.PackageManager
import androidx.test.core.app.ApplicationProvider
import io.sentry.Sentry
import nl.trainerhub.app.BuildConfig
import nl.trainerhub.app.TrainerHubApplication
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

// E009 AC9 (spec #32): the debug app, built without a DSN, starts no Sentry SDK at all: not from the application, and
// not through the SDK's own content providers, which the manifest removes.
class ObservabilityAppTest {
    @Test
    fun E009_AC9_debugAppWithoutDsnStartsNoSdk() {
        val app = ApplicationProvider.getApplicationContext<TrainerHubApplication>()
        val providers = app.packageManager
            .getPackageInfo(app.packageName, PackageManager.GET_PROVIDERS)
            .providers.orEmpty()
            .map { it.name }

        assertEquals("", BuildConfig.SENTRY_DSN)
        assertFalse(Sentry.isEnabled())
        assertEquals(emptyList<String>(), providers.filter { it.startsWith("io.sentry.") })
    }
}

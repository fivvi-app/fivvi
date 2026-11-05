package app.fivvi.core.observability

import android.content.pm.PackageManager
import androidx.test.core.app.ApplicationProvider
import app.fivvi.pro.BuildConfig
import app.fivvi.pro.FivviApplication
import io.sentry.Sentry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

// E009 AC9 (spec #32): the debug app, built without a DSN, starts no Sentry SDK at all: not from the application, and
// not through the SDK's own content providers, which the manifest removes. In the observability package, the one place
// the lint rule lets call Sentry.
class ObservabilityAppTest {
    @Test
    fun E009_AC9_debugAppWithoutDsnStartsNoSdk() {
        val app = ApplicationProvider.getApplicationContext<FivviApplication>()
        val providers = app.packageManager
            .getPackageInfo(app.packageName, PackageManager.GET_PROVIDERS)
            .providers.orEmpty()
            .map { it.name }

        assertEquals("", BuildConfig.SENTRY_DSN)
        assertFalse(Sentry.isEnabled())
        assertEquals(emptyList<String>(), providers.filter { it.startsWith("io.sentry.") })
    }
}

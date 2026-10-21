package app.fivvi.pro

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// Spec #34: plain HTTP only in debug builds (the local web server); release talks HTTPS only.
class CleartextConfigTest {
    private fun source(path: String) = File("src/$path").readText()

    @Test
    fun E008_mainManifestForbidsCleartext() {
        val manifest = source("main/AndroidManifest.xml")
        assertTrue(manifest.contains("android:usesCleartextTraffic=\"false\""))
        assertFalse(manifest.contains("networkSecurityConfig"))
        assertFalse(File("src/main/res/xml/network_security_config.xml").exists())
    }

    @Test
    fun E008_debugBuildAllowsCleartext() {
        assertTrue(source("debug/AndroidManifest.xml").contains("@xml/network_security_config"))
        assertTrue(source("debug/res/xml/network_security_config.xml").contains("cleartextTrafficPermitted=\"true\""))
    }
}

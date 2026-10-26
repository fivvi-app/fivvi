package app.fivvi.pro.auth

import java.io.File
import org.junit.Assert.assertTrue
import org.junit.Test

// AC11: the session store is excluded from Auto Backup (Android 11 and lower, `fullBackupContent`) and from backup and
// device-to-device transfer (Android 12 and up, `dataExtractionRules`). A restored token couldn't be decrypted anyway:
// the Keystore key never leaves the device.
class BackupRulesTest {
    private fun source(path: String) = File("src/$path").readText()

    private val exclude = Regex("""<exclude\s+domain="file"\s+path="${KeystoreSessionStore.DIRECTORY}/?"\s*/>""")

    @Test
    fun F001N_AC11_manifestPointsAtTheRules() {
        val manifest = source("main/AndroidManifest.xml")

        assertTrue(manifest.contains("android:fullBackupContent=\"@xml/backup_rules\""))
        assertTrue(manifest.contains("android:dataExtractionRules=\"@xml/data_extraction_rules\""))
    }

    @Test
    fun F001N_AC11_autoBackupExcludesTheSessionStore() {
        assertTrue(exclude.containsMatchIn(source("main/res/xml/backup_rules.xml")))
    }

    @Test
    fun F001N_AC11_cloudBackupAndDeviceTransferExcludeTheSessionStore() {
        val rules = source("main/res/xml/data_extraction_rules.xml")

        for (section in listOf("cloud-backup", "device-transfer")) {
            val body = Regex("""<$section[^>]*>(.*?)</$section>""", RegexOption.DOT_MATCHES_ALL).find(rules)
            assertTrue(
                "$section has no exclusion of the session store",
                body != null && exclude.containsMatchIn(body.value),
            )
        }
    }
}

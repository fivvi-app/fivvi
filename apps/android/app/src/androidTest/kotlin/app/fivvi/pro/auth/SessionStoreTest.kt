package app.fivvi.pro.auth

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import java.io.File
import java.security.KeyStore
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// The Keystore-backed store on a device or emulator (AC11).
class SessionStoreTest {
    private val context = ApplicationProvider.getApplicationContext<Context>()
    private val store = KeystoreSessionStore(context)
    private val file = File(File(context.filesDir, KeystoreSessionStore.DIRECTORY), KeystoreSessionStore.FILE_NAME)

    @After
    fun tearDown() = store.delete()

    @Test
    fun F001N_AC11_tokenEncryptedWithKeystoreKey() {
        store.save(TOKEN)

        assertEquals(TOKEN, store.read())
        // The file holds neither the token nor its UTF-8 bytes: it is the ciphertext of a key in the Keystore.
        val stored = file.readBytes()
        assertFalse(String(stored, Charsets.ISO_8859_1).contains(TOKEN))
        assertTrue(
            KeyStore.getInstance("AndroidKeyStore").apply {
                load(null)
            }.containsAlias(KeystoreSessionStore.KEY_ALIAS),
        )
    }

    @Test
    fun F001N_AC11_theTokenIsNotInSharedPreferences() {
        store.save(TOKEN)

        val preferences = File(context.applicationInfo.dataDir, "shared_prefs")
        val leaked = preferences.listFiles().orEmpty().filter { it.readText().contains(TOKEN) }
        assertEquals(emptyList<File>(), leaked)
    }

    @Test
    fun F001N_AC11_savingTwiceStoresDifferentCiphertextAndTheLatestToken() {
        store.save(TOKEN)
        val first = file.readBytes()

        store.save(TOKEN)

        assertNotEquals(first.toList(), file.readBytes().toList())
        assertEquals(TOKEN, store.read())
    }

    @Test
    fun F001N_AC11_aNewStoreReadsWhatAnotherSaved() {
        store.save(TOKEN)

        assertEquals(TOKEN, KeystoreSessionStore(context).read())
    }

    @Test
    fun F001N_AC11_deleteRemovesTheToken() {
        store.save(TOKEN)

        store.delete()

        assertNull(store.read())
        assertFalse(file.exists())
    }

    @Test
    fun F001N_AC13_noTokenReadsAsNull() {
        store.delete()

        assertNull(store.read())
    }

    @Test
    fun F001N_AC11_aDamagedFileReadsAsNoTokenAndIsDeleted() {
        store.save(TOKEN)
        val damaged = file.readBytes().also { it[it.size - 1] = (it[it.size - 1] + 1).toByte() }
        file.writeBytes(damaged)

        assertNull(store.read())
        assertFalse(file.exists())
    }

    @Test
    fun F001N_AC11_aFileFromAnotherDeviceReadsAsNoToken() {
        // What a restore would bring back: bytes that the key on this device did not encrypt.
        file.parentFile?.mkdirs()
        file.writeBytes(ByteArray(48) { it.toByte() })

        assertNull(store.read())
        assertFalse(file.exists())
    }

    @Test
    fun F001N_AC11_aTruncatedFileReadsAsNoToken() {
        file.parentFile?.mkdirs()
        file.writeBytes(byteArrayOf(12, 1, 2))

        assertNull(store.read())
    }

    @Test
    fun F001N_AC11_storedBytesAreStableAcrossReads() {
        store.save(TOKEN)
        val before = file.readBytes()

        store.read()

        assertArrayEquals(before, file.readBytes())
    }

    private companion object {
        const val TOKEN = "Zk3-sample-session-token-0123456789"
    }
}

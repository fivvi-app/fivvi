package app.fivvi.pro.auth

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import java.io.File
import java.io.IOException
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Owns the bearer token (F001, AC11): save, read, delete. The token goes nowhere else. */
interface SessionStore {
    /** The stored token, or null when there is none or it can't be read. */
    fun read(): String?

    /** @throws IOException when the token can't be stored. */
    fun save(token: String)

    fun delete()
}

/**
 * The token encrypted with an AES-GCM key from the Android Keystore, in a file in the app's private storage.
 * [DIRECTORY] is excluded from Auto Backup and device-to-device transfer (`res/xml/backup_rules.xml` and
 * `data_extraction_rules.xml`), and the key never leaves the device, so a copied file couldn't be read anyway. Never
 * `SharedPreferences` and never plain text.
 *
 * A file or key that can't be used (the key is gone or broken, the file is empty or damaged) is dropped, file and key
 * entry both: the token reads as none, the person signs in again, and the next save makes a new key. Crypto and file
 * I/O block, so callers other than the start-up read keep them off the main thread.
 */
class KeystoreSessionStore(context: Context) : SessionStore {
    private val file = AtomicFile(File(File(context.filesDir, DIRECTORY), FILE_NAME))

    @Synchronized
    override fun read(): String? {
        val bytes = try {
            file.readFully()
        } catch (_: IOException) {
            return null
        }
        return try {
            decrypt(bytes)
        } catch (_: Exception) {
            reset()
            null
        }
    }

    @Synchronized
    override fun save(token: String) {
        val plain = token.toByteArray(Charsets.UTF_8)
        val encrypted = try {
            encrypt(plain)
        } catch (_: Exception) {
            // The key entry is unusable: replace it once, then give up.
            reset()
            try {
                encrypt(plain)
            } catch (error: Exception) {
                throw IOException("The session could not be encrypted", error)
            }
        }
        file.baseFile.parentFile?.mkdirs()
        val stream = file.startWrite()
        try {
            stream.write(encrypted)
            file.finishWrite(stream)
        } catch (error: IOException) {
            file.failWrite(stream)
            throw error
        }
    }

    @Synchronized
    override fun delete() = file.delete()

    // Drops the file and the key entry, so that the next save makes a new key. Best effort: there's nothing else to do.
    private fun reset() {
        file.delete()
        try {
            keyStore().deleteEntry(KEY_ALIAS)
        } catch (_: Exception) {
            // The entry stays; the next save fails with an IOException and the sign-in shows an error.
        }
    }

    // The stored bytes: the IV's length, the IV, then the ciphertext with its GCM tag.
    private fun encrypt(plain: ByteArray): ByteArray {
        val cipher = Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.ENCRYPT_MODE, key()) }
        val iv = cipher.iv
        return byteArrayOf(iv.size.toByte()) + iv + cipher.doFinal(plain)
    }

    private fun decrypt(stored: ByteArray): String {
        require(stored.isNotEmpty()) { "not a stored token" }
        val ivSize = stored.first().toInt()
        require(ivSize > 0 && stored.size > 1 + ivSize) { "not a stored token" }
        val cipher = Cipher.getInstance(TRANSFORMATION).apply {
            init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(TAG_BITS, stored, 1, ivSize))
        }
        return String(cipher.doFinal(stored, 1 + ivSize, stored.size - 1 - ivSize), Charsets.UTF_8)
    }

    private fun keyStore(): KeyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }

    private fun key(): SecretKey {
        (keyStore().getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val spec = KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(KEY_BITS)
            .build()
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE).apply { init(spec) }.generateKey()
    }

    companion object {
        /** In the app's `filesDir`; the backup rules name it. */
        const val DIRECTORY = "session"
        const val KEY_ALIAS = "app.fivvi.pro.session"
        internal const val FILE_NAME = "token.enc"
        private const val KEYSTORE = "AndroidKeyStore"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val KEY_BITS = 256
        private const val TAG_BITS = 128
    }
}

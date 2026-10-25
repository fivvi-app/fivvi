package app.fivvi.pro.auth

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import java.io.File
import java.io.IOException
import java.security.GeneralSecurityException
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Owns the bearer token (F001, AC11): save, read, delete. The token goes nowhere else. */
interface SessionStore {
    /** The stored token, or null when there is none or it can't be read. */
    fun read(): String?

    fun save(token: String)

    fun delete()
}

/**
 * The token encrypted with an AES-GCM key from the Android Keystore, in a file in the app's private storage.
 * [DIRECTORY] is excluded from Auto Backup and device-to-device transfer (`res/xml/backup_rules.xml` and
 * `data_extraction_rules.xml`), and the key never leaves the device, so a copied file couldn't be read anyway. Never
 * `SharedPreferences` and never plain text. A file that can't be decrypted (the key is gone, the file is damaged) is
 * deleted and read as no token: the person signs in again.
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
        } catch (_: GeneralSecurityException) {
            file.delete()
            null
        } catch (_: IllegalArgumentException) {
            file.delete()
            null
        }
    }

    @Synchronized
    override fun save(token: String) {
        val encrypted = encrypt(token.toByteArray(Charsets.UTF_8))
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

    // The stored bytes: the IV's length, the IV, then the ciphertext with its GCM tag.
    private fun encrypt(plain: ByteArray): ByteArray {
        val cipher = Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.ENCRYPT_MODE, key()) }
        val iv = cipher.iv
        return byteArrayOf(iv.size.toByte()) + iv + cipher.doFinal(plain)
    }

    private fun decrypt(stored: ByteArray): String {
        val ivSize = stored.first().toInt()
        require(ivSize > 0 && stored.size > 1 + ivSize) { "not a stored token" }
        val cipher = Cipher.getInstance(TRANSFORMATION).apply {
            init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(TAG_BITS, stored, 1, ivSize))
        }
        return String(cipher.doFinal(stored, 1 + ivSize, stored.size - 1 - ivSize), Charsets.UTF_8)
    }

    private fun key(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
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

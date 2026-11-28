package app.fivvi.core.auth

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import java.io.File
import java.io.IOException
import java.security.KeyStore
import java.util.UUID
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

    /**
     * An opaque ID of the sign-in that holds the stored token: new with every [save], the same until the token is deleted,
     * `null` when there is no token or the store keeps none. It is a random value, never made from the token or from anything
     * personal; what a screen keeps for one sign-in (F025's offline queue) is tied to it. Not a secret.
     */
    fun signInId(): String? = null
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
    private val signInFile = AtomicFile(File(File(context.filesDir, DIRECTORY), SIGN_IN_FILE_NAME))

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
        // The ID goes first: a token is never stored without one, and an ID without a token is read as none.
        write(signInFile, UUID.randomUUID().toString().toByteArray(Charsets.UTF_8))
        write(file, encrypted)
    }

    @Synchronized
    override fun delete() {
        file.delete()
        signInFile.delete()
    }

    @Synchronized
    override fun signInId(): String? {
        if (!file.baseFile.exists()) return null
        val stored = try {
            String(signInFile.readFully(), Charsets.UTF_8).takeIf { it.isNotBlank() }
        } catch (_: IOException) {
            null
        }
        if (stored != null) return stored
        // A token with no ID (stored before IDs existed): it gets one now, and keeps it.
        val created = UUID.randomUUID().toString()
        return try {
            write(signInFile, created.toByteArray(Charsets.UTF_8))
            created
        } catch (_: IOException) {
            null
        }
    }

    private fun write(target: AtomicFile, bytes: ByteArray) {
        val stream = target.startWrite()
        try {
            stream.write(bytes)
            target.finishWrite(stream)
        } catch (error: IOException) {
            target.failWrite(stream)
            throw error
        }
    }

    // Drops the file and the key entry, so that the next save makes a new key. Best effort: there's nothing else to do.
    private fun reset() {
        file.delete()
        signInFile.delete()
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
        const val FILE_NAME = "token.enc"
        const val SIGN_IN_FILE_NAME = "sign-in-id"
        private const val KEYSTORE = "AndroidKeyStore"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val KEY_BITS = 256
        private const val TAG_BITS = 128
    }
}

package app.fivvi.core.auth

import java.util.UUID

/** A [SessionStore] in memory, for tests that don't need the Keystore. */
class InMemorySessionStore(private var token: String? = null) : SessionStore {
    private var signInId: String? = token?.let { UUID.randomUUID().toString() }

    override fun read(): String? = token

    override fun save(token: String) {
        this.token = token
        signInId = UUID.randomUUID().toString()
    }

    override fun delete() {
        token = null
        signInId = null
    }

    override fun signInId(): String? = signInId
}

package app.fivvi.pro.auth

/** A [SessionStore] in memory, for tests that don't need the Keystore. */
class InMemorySessionStore(private var token: String? = null) : SessionStore {
    override fun read(): String? = token

    override fun save(token: String) {
        this.token = token
    }

    override fun delete() {
        token = null
    }
}

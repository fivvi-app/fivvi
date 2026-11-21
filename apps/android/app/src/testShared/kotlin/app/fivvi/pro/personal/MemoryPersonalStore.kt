package app.fivvi.pro.personal

/** A [PersonalStore] that keeps its files in memory: the screens' tests and the host before a sign-in. */
class MemoryPersonalStore : PersonalStore {
    private val files = mutableMapOf<String, ByteArray>()

    @Synchronized
    override fun read(name: String): ByteArray? = files[name]

    @Synchronized
    override fun write(name: String, data: ByteArray) {
        files[name] = data
    }

    @Synchronized
    override fun clear() = files.clear()
}

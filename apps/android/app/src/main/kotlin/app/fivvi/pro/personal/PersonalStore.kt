package app.fivvi.pro.personal

import app.fivvi.api.infrastructure.Serializer
import app.fivvi.api.models.MyDay
import app.fivvi.api.models.MySessions
import java.io.File
import java.io.IOException
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long

/**
 * What the personal screens keep on the phone for the offline view (F013 AC7, spec #457): the last `GET /v1/me/day` answer,
 * the last `GET /v1/me/sessions` answers of Agenda ([PersonalCache.KEPT_RANGES] ranges) and the workspaces the person was
 * on, to notice one that is gone. Read only: nothing is queued. It holds client names,
 * so it is a file in the app's private storage ([DIRECTORY], excluded from Auto Backup and from device transfer in
 * `res/xml/backup_rules.xml` and `data_extraction_rules.xml`), nothing of it is logged, and it goes with the sign-out.
 */
interface PersonalStore {
    fun read(name: String): ByteArray?

    fun write(name: String, data: ByteArray)

    /** Forgets everything: a sign-out, or another account. */
    fun clear()

    companion object {
        /** The folder of the app's files that holds it. */
        const val DIRECTORY = "personal"
    }
}

/** [PersonalStore] in the files of [directory]; a file is replaced as a whole, never half written. */
class FilePersonalStore(private val directory: File) : PersonalStore {
    @Synchronized
    override fun read(name: String): ByteArray? = try {
        File(directory, name).readBytes()
    } catch (_: IOException) {
        null
    }

    @Synchronized
    override fun write(name: String, data: ByteArray) {
        // A cache that can't be written is a cache that is not there: the screen reads the API as before.
        try {
            directory.mkdirs()
            val target = File(directory, name)
            val partial = File(directory, "$name.part")
            partial.writeBytes(data)
            Files.move(
                partial.toPath(),
                target.toPath(),
                StandardCopyOption.ATOMIC_MOVE,
                StandardCopyOption.REPLACE_EXISTING,
            )
        } catch (_: IOException) {
            return
        }
    }

    @Synchronized
    override fun clear() {
        directory.deleteRecursively()
    }
}

/** The day and the workspaces as the phone keeps them. */
class PersonalCache(private val store: PersonalStore) {
    /** The answer for one day, and when the phone read it. */
    data class Day(val day: MyDay, val savedAt: Instant)

    /** An answer of `GET /v1/me/sessions` for the days [from] to [until], as Agenda read it at [savedAt]. */
    data class Sessions(val from: LocalDate, val until: LocalDate, val response: MySessions, val savedAt: Instant)

    /** A workspace the person is on, by ID and name: the name is what the notice says once it is gone. */
    data class Workspace(val id: UUID, val name: String)

    private val json = Serializer.kotlinxSerializationJson

    var day: Day?
        get() = store.read(DAY_FILE)?.let { bytes ->
            try {
                val root = json.parseToJsonElement(bytes.decodeToString()).jsonObject
                Day(
                    json.decodeFromJsonElement(MyDay.serializer(), root.getValue(DAY)),
                    Instant.ofEpochMilli(root.getValue(SAVED_AT).jsonPrimitive.long),
                )
            } catch (_: SerializationException) {
                null
            } catch (_: IllegalArgumentException) {
                null
            } catch (_: NoSuchElementException) {
                null
            }
        }
        set(value) {
            value ?: return
            val root = JsonObject(
                mapOf(
                    DAY to json.encodeToJsonElement(MyDay.serializer(), value.day),
                    SAVED_AT to JsonPrimitive(value.savedAt.toEpochMilli()),
                ),
            )
            store.write(DAY_FILE, root.toString().encodeToByteArray())
        }

    /** The ranges Agenda read last, newest first; none when nothing was kept or the file can't be read. */
    var sessions: List<Sessions>
        get() = store.read(SESSIONS_FILE)?.let { bytes ->
            try {
                json.parseToJsonElement(bytes.decodeToString()).jsonArray.map {
                    val item = it.jsonObject
                    Sessions(
                        LocalDate.parse(item.getValue(FROM).jsonPrimitive.content),
                        LocalDate.parse(item.getValue(UNTIL).jsonPrimitive.content),
                        json.decodeFromJsonElement(MySessions.serializer(), item.getValue(RESPONSE)),
                        Instant.ofEpochMilli(item.getValue(SAVED_AT).jsonPrimitive.long),
                    )
                }
            } catch (_: SerializationException) {
                null
            } catch (_: IllegalArgumentException) {
                null
            } catch (_: NoSuchElementException) {
                null
            } catch (_: java.time.DateTimeException) {
                null
            }
        }.orEmpty()
        set(value) {
            val array = JsonArray(
                value.map {
                    JsonObject(
                        mapOf(
                            FROM to JsonPrimitive(it.from.toString()),
                            UNTIL to JsonPrimitive(it.until.toString()),
                            RESPONSE to json.encodeToJsonElement(MySessions.serializer(), it.response),
                            SAVED_AT to JsonPrimitive(it.savedAt.toEpochMilli()),
                        ),
                    )
                },
            )
            store.write(SESSIONS_FILE, array.toString().encodeToByteArray())
        }

    /** Keeps the answer for its days, in front of the others and in place of an earlier one for the same days. */
    fun keep(answer: Sessions) {
        val others = sessions.filter { !(it.from == answer.from && it.until == answer.until) }
        sessions = (listOf(answer) + others).take(KEPT_RANGES)
    }

    var workspaces: List<Workspace>?
        get() = store.read(WORKSPACES_FILE)?.let { bytes ->
            try {
                json.parseToJsonElement(bytes.decodeToString()).jsonArray.map {
                    val item = it.jsonObject
                    Workspace(
                        UUID.fromString(item.getValue(ID).jsonPrimitive.content),
                        item.getValue(NAME).jsonPrimitive.content,
                    )
                }
            } catch (_: SerializationException) {
                null
            } catch (_: IllegalArgumentException) {
                null
            } catch (_: NoSuchElementException) {
                null
            }
        }
        set(value) {
            value ?: return
            val array = JsonArray(
                value.map { JsonObject(mapOf(ID to JsonPrimitive(it.id.toString()), NAME to JsonPrimitive(it.name))) },
            )
            store.write(WORKSPACES_FILE, array.toString().encodeToByteArray())
        }

    companion object {
        /** How many ranges Agenda keeps: the last ones it read, the newest first. */
        const val KEPT_RANGES = 6

        private const val DAY_FILE = "day.json"
        private const val SESSIONS_FILE = "sessions.json"
        private const val WORKSPACES_FILE = "workspaces.json"
        private const val DAY = "day"
        private const val FROM = "from"
        private const val UNTIL = "until"
        private const val RESPONSE = "response"
        private const val SAVED_AT = "savedAt"
        private const val ID = "id"
        private const val NAME = "name"
    }
}

package app.fivvi.pro.clients

import app.fivvi.api.apis.ClientsApi
import app.fivvi.api.models.AddClientRequest
import app.fivvi.api.models.Client
import app.fivvi.api.models.ClientList
import app.fivvi.api.models.UpdateClientRequest
import java.util.UUID
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import retrofit2.Response

/** The ID the fakes give the client of this name, so a test can name it without keeping it. */
fun clientIdOf(name: String): UUID = UUID.nameUUIDFromBytes("client:$name".toByteArray())

/** Every client has an email address; a test that does not care gets a synthetic one from the name. */
fun clientOf(
    name: String,
    email: String = "${name.lowercase().replace(' ', '.')}@example.com",
    locale: Client.EmailLocale? = null,
) = Client(clientIdOf(name), name, email, locale)

private val JSON = "application/json".toMediaType()

/**
 * The generated client's own API interface for tests. It holds [clients] and answers a list, a search and a read from
 * them (the server's sorting and matching are the API's own and tested there; here a search is a plain, case-insensitive
 * part of the name or the address). An add and an edit answer with the next queued answer, or, without one, accept what
 * was sent (an empty address is refused with a `400` on `email`, as the API does). A queued [failure] makes the next call fail with that exception (no connection).
 */
class FakeClientsApi : ClientsApi {
    val clients = mutableListOf<Client>()

    /** Every `search` parameter received by the list call, in order. */
    val searches = mutableListOf<String?>()
    var listCalls = 0
        private set
    val added = mutableListOf<AddClientRequest>()
    val updated = mutableListOf<Pair<UUID, UpdateClientRequest>>()
    val addAnswers = ArrayDeque<suspend (AddClientRequest) -> Response<Client>>()
    val updateAnswers = ArrayDeque<suspend (UUID, UpdateClientRequest) -> Response<Client>>()

    /** While set, every call fails with it (a lost connection). */
    var failure: Exception? = null

    /** While set, the list answers with this status and no clients (for example 403). */
    var listStatus: Int? = null

    /** While set, the read of one client answers with this status. */
    var getStatus: Int? = null

    /** The workspace each list call asked for, in order. */
    val listed = mutableListOf<UUID>()

    /** The pages the list was asked for, in order. */
    val pages = mutableListOf<Int?>()

    /** The total the list reports, when it differs from the clients it holds (more than one page). */
    var total: Int? = null

    override suspend fun listClients(
        workspaceId: UUID,
        search: String?,
        pageSize: Int?,
        page: Int?,
    ): Response<ClientList> {
        listCalls++
        listed += workspaceId
        searches += search
        pages += page
        failure?.let { throw it }
        listStatus?.let { return Response.error(it, "{}".toResponseBody(JSON)) }
        val found = clients.filter { search.isNullOrBlank() || it.matches(search.trim()) }.sortedBy { it.name }
        return Response.success(ClientList(found, total ?: found.size))
    }

    private fun Client.matches(part: String) =
        name.contains(part, ignoreCase = true) || email.contains(part, ignoreCase = true)

    /** The client of each single read, in order. */
    val read = mutableListOf<UUID>()

    override suspend fun getClient(workspaceId: UUID, clientId: UUID): Response<Client> {
        read += clientId
        failure?.let { throw it }
        getStatus?.let { return Response.error(it, "{}".toResponseBody(JSON)) }
        val client = clients.firstOrNull { it.id == clientId }
            ?: return Response.error(404, """{"code":"not_found"}""".toResponseBody(JSON))
        return Response.success(client)
    }

    override suspend fun addClient(workspaceId: UUID, addClientRequest: AddClientRequest): Response<Client> {
        added += addClientRequest
        failure?.let { throw it }
        if (addAnswers.isNotEmpty()) return addAnswers.removeFirst()(addClientRequest)
        // As the API: a missing or empty address is a `400` on `email` (every client has one), and nothing is saved.
        if (addClientRequest.email.isBlank()) return refused("email" to "invalid_format")
        val client = Client(
            UUID.randomUUID(),
            addClientRequest.name.trim(),
            addClientRequest.email.lowercase(),
            addClientRequest.emailLocale?.let {
                if (it ==
                    AddClientRequest.EmailLocale.EN
                ) {
                    Client.EmailLocale.EN
                } else {
                    Client.EmailLocale.NL_NL
                }
            },
        )
        clients += client
        return Response.success(201, client)
    }

    override suspend fun updateClient(
        workspaceId: UUID,
        clientId: UUID,
        updateClientRequest: UpdateClientRequest,
    ): Response<Client> {
        updated += clientId to updateClientRequest
        failure?.let { throw it }
        if (updateAnswers.isNotEmpty()) return updateAnswers.removeFirst()(clientId, updateClientRequest)
        // As the API: an address can be changed, never cleared; an empty one is a `400` on `email`.
        if (updateClientRequest.email?.isBlank() == true) return refused("email" to "invalid_format")
        val old = clients.first { it.id == clientId }
        val changed = Client(
            old.id,
            updateClientRequest.name ?: old.name,
            updateClientRequest.email?.lowercase() ?: old.email,
            if (updateClientRequest.clearEmailLocale == true) {
                null
            } else {
                updateClientRequest.emailLocale?.let {
                    if (it ==
                        UpdateClientRequest.EmailLocale.EN
                    ) {
                        Client.EmailLocale.EN
                    } else {
                        Client.EmailLocale.NL_NL
                    }
                }
                    ?: old.emailLocale
            },
        )
        clients[clients.indexOf(old)] = changed
        return Response.success(changed)
    }

    /** `400 validation_failed` with these issues: path to code. */
    fun refused(vararg issues: Pair<String, String>): Response<Client> {
        val list = issues.joinToString(",") { (path, code) -> """{"path":"$path","code":"$code"}""" }
        return Response.error(400, """{"code":"validation_failed","issues":[$list]}""".toResponseBody(JSON))
    }

    /** `409 client_exists` with the ID of the client that has the address. */
    fun exists(clientId: UUID): Response<Client> =
        Response.error(409, """{"code":"client_exists","clientId":"$clientId"}""".toResponseBody(JSON))

    fun status(code: Int): Response<Client> = Response.error(code, "{}".toResponseBody(JSON))
}

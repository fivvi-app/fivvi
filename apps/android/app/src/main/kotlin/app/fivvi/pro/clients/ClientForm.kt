package app.fivvi.pro.clients

import app.fivvi.api.apis.ClientsApi
import app.fivvi.api.infrastructure.Serializer
import app.fivvi.api.models.AddClientRequest
import app.fivvi.api.models.Client
import app.fivvi.api.models.ClientExists
import app.fivvi.api.models.ValidationError
import java.io.IOException
import java.net.HttpURLConnection.HTTP_BAD_REQUEST
import java.net.HttpURLConnection.HTTP_CONFLICT
import java.net.HttpURLConnection.HTTP_FORBIDDEN
import java.net.HttpURLConnection.HTTP_NOT_FOUND
import java.util.UUID
import kotlinx.serialization.SerializationException
import retrofit2.Response

/** The language for a client's emails as the form offers it: the workspace default, or one of the two languages. */
enum class EmailLanguageChoice { Default, Dutch, English }

/** What the add and the edit form hold; an empty address is none, and nothing is checked here (the API words the errors). */
data class ClientForm(
    val name: String = "",
    val email: String = "",
    val language: EmailLanguageChoice = EmailLanguageChoice.Default,
)

/** The `clients.addDialog.errors.*` messages that word a refused name. */
enum class NameError { Required, TooLong }

enum class EmailError { Invalid }

/** A client of the workspace that has the address that was typed (the 409 of AC3). */
data class Duplicate(val id: UUID, val name: String)

/** Why the API did not take an add or an edit. */
sealed interface Refusal {
    /** `400`: these fields were refused, worded by their codes. */
    data class Fields(val name: NameError?, val email: EmailError?) : Refusal

    /** `409`: a client of the workspace has the address. */
    data class Exists(val clientId: UUID) : Refusal

    /** `403` or `404`: the person may not do this (any more) in the workspace. */
    data object NotAllowed : Refusal

    /** Anything else: it did not work, and the input stays. */
    data object Failed : Refusal
}

// The generated client's own Json, which knows the UUID of `client_exists`.
private val problems get() = Serializer.kotlinxSerializationJson

/**
 * Reads the problem body of a refused add or edit like the web does: an issue `too_big` on `name` is a name that is too
 * long, any other issue on it an empty or blank one, any issue on `email` an address that is none; `client_exists` names
 * the client. The text of an answer is never shown, only these codes.
 */
internal fun Response<*>.refusal(): Refusal {
    val body = errorBody()?.string().orEmpty()
    return when (code()) {
        HTTP_FORBIDDEN, HTTP_NOT_FOUND -> Refusal.NotAllowed

        HTTP_CONFLICT -> runCatching { problems.decodeFromString<ClientExists>(body) }
            .map { Refusal.Exists(it.clientId) }
            .getOrDefault(Refusal.Failed)

        HTTP_BAD_REQUEST -> fieldRefusal(body)

        else -> Refusal.Failed
    }
}

private fun fieldRefusal(body: String): Refusal {
    val issues =
        runCatching { problems.decodeFromString<ValidationError>(body).issues }.getOrNull() ?: return Refusal.Failed
    val name = issues.firstOrNull { it.path == "name" }?.let {
        if (it.code ==
            "too_big"
        ) {
            NameError.TooLong
        } else {
            NameError.Required
        }
    }
    val email = if (issues.any { it.path == "email" }) EmailError.Invalid else null
    return if (name != null || email != null) Refusal.Fields(name, email) else Refusal.Failed
}

internal fun EmailLanguageChoice.toAddLocale(): AddClientRequest.EmailLocale? = when (this) {
    EmailLanguageChoice.Default -> null
    EmailLanguageChoice.Dutch -> AddClientRequest.EmailLocale.NL_NL
    EmailLanguageChoice.English -> AddClientRequest.EmailLocale.EN
}

/** The choice that shows a client's stored language: none is the workspace default. */
fun Client.EmailLocale?.toChoice(): EmailLanguageChoice = when (this) {
    null -> EmailLanguageChoice.Default
    Client.EmailLocale.NL_NL -> EmailLanguageChoice.Dutch
    Client.EmailLocale.EN -> EmailLanguageChoice.English
}

/** The 409 names only the ID; the client is this workspace's own, so it can be read (`GET .../clients/{id}`). */
internal suspend fun ClientsApi.existing(workspaceId: UUID, clientId: UUID): Duplicate? {
    val response = try {
        getClient(workspaceId, clientId)
    } catch (_: IOException) {
        return null
    } catch (_: SerializationException) {
        return null
    }
    return response.body()?.takeIf { response.isSuccessful }?.let { Duplicate(it.id, it.name) }
}

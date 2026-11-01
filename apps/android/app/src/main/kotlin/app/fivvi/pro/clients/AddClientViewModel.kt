package app.fivvi.pro.clients

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fivvi.api.apis.ClientsApi
import app.fivvi.api.models.AddClientRequest
import app.fivvi.api.models.Client
import app.fivvi.api.models.Locale
import java.io.IOException
import java.util.UUID
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.SerializationException
import retrofit2.Response

data class AddClientState(
    val form: ClientForm = ClientForm(),
    val pending: Boolean = false,
    val nameError: NameError? = null,
    val emailError: EmailError? = null,
    /** A client of the workspace has the typed address: the form offers that client instead (AC3). */
    val duplicate: Duplicate? = null,
    /** The add did not go through (no connection, or an answer the form can't word): *Niet opgeslagen…*. */
    val failed: Boolean = false,
    /** The client that was added; the screen opens its profile. */
    val added: Client? = null,
    /** The API refused the add as not allowed: the form closes, and the capability helper has hidden the action. */
    val notAllowed: Boolean = false,
)

/**
 * *+ Nieuwe klant* (F006 AC1–AC3, AC12): `POST /workspaces/{id}/clients` through the generated client, with surface
 * `android` so the API records `client_added`. Only the name is required, and nothing is checked in the app: the API's
 * answer words the field messages, a refused form keeps what was typed, and a 409 offers the client that has the address.
 * An empty address or a default language is left out of the request, so the client follows the workspace's default.
 * [workspaceDefault] is only the language named in *Standaard (…)*. [onNotAllowed] is told a 403 or 404 for the capability
 * helper (F004 AC10).
 */
class AddClientViewModel(
    private val api: ClientsApi,
    private val workspaceId: UUID,
    val workspaceDefault: Locale,
    private val onNotAllowed: (Response<*>) -> Unit = {},
) : ViewModel() {
    private val _state = MutableStateFlow(AddClientState())
    val state: StateFlow<AddClientState> = _state.asStateFlow()

    fun onNameChange(name: String) = _state.update {
        it.copy(form = it.form.copy(name = name), nameError = null, failed = false)
    }

    fun onEmailChange(email: String) = _state.update {
        it.copy(form = it.form.copy(email = email), emailError = null, duplicate = null, failed = false)
    }

    fun onLanguageChange(language: EmailLanguageChoice) = _state.update {
        it.copy(form = it.form.copy(language = language), failed = false)
    }

    /** *Ander e-mailadres*: closes the offer; the address stays to be changed. */
    fun useAnotherEmail() = _state.update { it.copy(duplicate = null) }

    fun submit() {
        val current = _state.value
        if (current.pending || current.added != null) return
        _state.value = current.copy(
            pending = true,
            nameError = null,
            emailError = null,
            duplicate = null,
            failed = false,
        )
        val form = current.form
        viewModelScope.launch {
            val outcome = send(form)
            // What was typed meanwhile stays; only the outcome of the add is applied.
            _state.update { outcome(it.copy(pending = false)) }
        }
    }

    private suspend fun send(form: ClientForm): (AddClientState) -> AddClientState {
        val request = AddClientRequest(
            name = form.name,
            email = form.email.trim().ifEmpty { null },
            emailLocale = form.language.toAddLocale(),
            surface = AddClientRequest.Surface.ANDROID,
        )
        val response = try {
            api.addClient(workspaceId, request)
        } catch (_: IOException) {
            return patch { it.copy(failed = true) }
        } catch (_: SerializationException) {
            return patch { it.copy(failed = true) }
        }
        val client = response.body()?.takeIf { response.isSuccessful }
        if (client != null) return patch { it.copy(added = client) }
        return when (val refusal = response.refusal()) {
            is Refusal.Fields -> patch { it.copy(nameError = refusal.name, emailError = refusal.email) }

            is Refusal.Exists -> {
                val duplicate = existing(refusal.clientId)
                if (duplicate != null) patch { it.copy(duplicate = duplicate) } else patch { it.copy(failed = true) }
            }

            Refusal.NotAllowed -> {
                onNotAllowed(response)
                patch { it.copy(notAllowed = true) }
            }

            Refusal.Failed -> patch { it.copy(failed = true) }
        }
    }

    private fun patch(change: (AddClientState) -> AddClientState): (AddClientState) -> AddClientState = change

    // The 409 names only the ID; the client is this workspace's own, so it can be read (`GET .../clients/{id}`).
    private suspend fun existing(clientId: UUID): Duplicate? {
        val response = try {
            api.getClient(workspaceId, clientId)
        } catch (_: IOException) {
            return null
        } catch (_: SerializationException) {
            return null
        }
        return response.body()?.takeIf { response.isSuccessful }?.let { Duplicate(it.id, it.name) }
    }
}

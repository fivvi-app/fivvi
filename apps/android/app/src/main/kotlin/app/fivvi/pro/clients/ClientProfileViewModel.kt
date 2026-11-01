package app.fivvi.pro.clients

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fivvi.api.apis.ClientsApi
import app.fivvi.api.models.Client
import app.fivvi.api.models.UpdateClientRequest
import java.io.IOException
import java.net.HttpURLConnection.HTTP_FORBIDDEN
import java.net.HttpURLConnection.HTTP_NOT_FOUND
import java.util.UUID
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.SerializationException
import retrofit2.Response

/** The edit form of the overview: the same fields and messages as the add form. */
data class ClientEdit(
    val form: ClientForm,
    val pending: Boolean = false,
    val nameError: NameError? = null,
    val emailError: EmailError? = null,
    val duplicate: Duplicate? = null,
    val failed: Boolean = false,
    /** The API refused the save as not allowed: the capability helper has hidden the action. */
    val notAllowed: Boolean = false,
)

sealed interface ClientProfileState {
    data object Loading : ClientProfileState

    /** The overview of [client]; [edit] is the open edit form; [saved] asks for the short confirmation, once. */
    data class Loaded(val client: Client, val edit: ClientEdit? = null, val saved: Boolean = false) : ClientProfileState

    data object Failed : ClientProfileState

    /** The client is not this person's to see (403, 404: also a client of another workspace, ADR-006). */
    data object NoAccess : ClientProfileState
}

/**
 * *Klantprofiel* (TM-03, F006 AC7, AC12): the overview (name, address, language for emails) from
 * `GET /workspaces/{id}/clients/{clientId}`, and the edit through `PATCH` with only the fields that changed. An address
 * that is cleared is `clearEmail`, a language set back to the default `clearEmailLocale`: the Kotlin client writes no
 * `null`, which the contract reads as "keep" (`UpdateClientRequestTest`). The rules of adding apply (the API words the
 * field messages and answers 409 for an address another client has); nothing is checked here. The profile reads the client
 * again on opening and on [refresh]; a read that fails leaves the client on screen. [onNotAllowed] is told a 403 or 404 for
 * the capability helper (F004 AC10).
 */
class ClientProfileViewModel(
    private val api: ClientsApi,
    private val workspaceId: UUID,
    private val clientId: UUID,
    private val onNotAllowed: (Response<*>) -> Unit = {},
) : ViewModel() {
    private val _state = MutableStateFlow<ClientProfileState>(ClientProfileState.Loading)
    val state: StateFlow<ClientProfileState> = _state.asStateFlow()
    private var loading: Job? = null

    init {
        load()
    }

    fun retry() {
        _state.value = ClientProfileState.Loading
        load()
    }

    /** The profile is shown again (the app came back, or the person returns to it): read the client again. */
    fun refresh() = load()

    private fun load() {
        loading?.cancel()
        loading = viewModelScope.launch { fetch() }
    }

    private suspend fun fetch() {
        val response = try {
            api.getClient(workspaceId, clientId)
        } catch (_: IOException) {
            return failed()
        } catch (_: SerializationException) {
            return failed()
        }
        val client = response.body()?.takeIf { response.isSuccessful }
        when {
            client != null -> _state.update {
                (it as? ClientProfileState.Loaded)?.copy(client = client)
                    ?: ClientProfileState.Loaded(client)
            }

            response.code() == HTTP_FORBIDDEN || response.code() == HTTP_NOT_FOUND -> {
                onNotAllowed(response)
                _state.value = ClientProfileState.NoAccess
            }

            else -> failed()
        }
    }

    private fun failed() {
        if (_state.value !is ClientProfileState.Loaded) _state.value = ClientProfileState.Failed
    }

    fun startEdit() = updateLoaded { shown ->
        val client = shown.client
        shown.copy(
            edit = ClientEdit(ClientForm(client.name, client.email.orEmpty(), client.emailLocale.toChoice())),
            saved = false,
        )
    }

    fun cancelEdit() = updateLoaded { it.copy(edit = null) }

    fun onNameChange(name: String) = updateEdit {
        it.copy(form = it.form.copy(name = name), nameError = null, failed = false)
    }

    fun onEmailChange(email: String) = updateEdit {
        it.copy(form = it.form.copy(email = email), emailError = null, duplicate = null, failed = false)
    }

    fun onLanguageChange(language: EmailLanguageChoice) =
        updateEdit { it.copy(form = it.form.copy(language = language), failed = false) }

    fun useAnotherEmail() = updateEdit { it.copy(duplicate = null) }

    /** The short confirmation after a save was shown. */
    fun onSavedShown() = updateLoaded { it.copy(saved = false) }

    fun save() {
        val shown = _state.value as? ClientProfileState.Loaded ?: return
        val edit = shown.edit ?: return
        if (edit.pending) return
        val request = changes(shown.client, edit.form)
        if (request == null) {
            _state.value = shown.copy(edit = null)
            return
        }
        _state.value = shown.copy(
            edit = edit.copy(pending = true, nameError = null, emailError = null, duplicate = null, failed = false),
        )
        viewModelScope.launch { send(request) }
    }

    private suspend fun send(request: UpdateClientRequest) {
        val response = try {
            api.updateClient(workspaceId, clientId, request)
        } catch (_: IOException) {
            return updateEdit { it.copy(pending = false, failed = true) }
        } catch (_: SerializationException) {
            return updateEdit { it.copy(pending = false, failed = true) }
        }
        val client = response.body()?.takeIf { response.isSuccessful }
        if (client != null) {
            return updateLoaded { it.copy(client = client, edit = null, saved = true) }
        }
        when (val refusal = response.refusal()) {
            is Refusal.Fields ->
                updateEdit { it.copy(pending = false, nameError = refusal.name, emailError = refusal.email) }

            is Refusal.Exists -> {
                val duplicate = api.existing(workspaceId, refusal.clientId)
                updateEdit {
                    if (duplicate !=
                        null
                    ) {
                        it.copy(pending = false, duplicate = duplicate)
                    } else {
                        it.copy(pending = false, failed = true)
                    }
                }
            }

            Refusal.NotAllowed -> {
                onNotAllowed(response)
                updateEdit { it.copy(pending = false, notAllowed = true) }
            }

            Refusal.Failed -> updateEdit { it.copy(pending = false, failed = true) }
        }
    }

    // Only what changed; null when nothing did. The address is the same in another case (the API stores it lowercase).
    private fun changes(client: Client, form: ClientForm): UpdateClientRequest? {
        val email = form.email.trim()
        val nameChanged = form.name != client.name
        val emailChanged = !email.equals(client.email.orEmpty(), ignoreCase = true)
        val languageChanged = form.language != client.emailLocale.toChoice()
        if (!nameChanged && !emailChanged && !languageChanged) return null
        return UpdateClientRequest(
            name = form.name.takeIf { nameChanged },
            email = email.takeIf { emailChanged && it.isNotEmpty() },
            clearEmail = true.takeIf { emailChanged && email.isEmpty() },
            emailLocale = form.language.toUpdateLocale().takeIf { languageChanged },
            clearEmailLocale = true.takeIf { languageChanged && form.language == EmailLanguageChoice.Default },
        )
    }

    private fun updateLoaded(change: (ClientProfileState.Loaded) -> ClientProfileState.Loaded) =
        _state.update { (it as? ClientProfileState.Loaded)?.let(change) ?: it }

    private fun updateEdit(change: (ClientEdit) -> ClientEdit) =
        updateLoaded { shown -> shown.edit?.let { shown.copy(edit = change(it)) } ?: shown }

    private fun EmailLanguageChoice.toUpdateLocale(): UpdateClientRequest.EmailLocale? = when (this) {
        EmailLanguageChoice.Default -> null
        EmailLanguageChoice.Dutch -> UpdateClientRequest.EmailLocale.NL_NL
        EmailLanguageChoice.English -> UpdateClientRequest.EmailLocale.EN
    }
}

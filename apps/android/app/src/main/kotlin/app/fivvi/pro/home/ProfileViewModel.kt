package app.fivvi.pro.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fivvi.api.apis.MeApi
import app.fivvi.api.apis.TrainersApi
import app.fivvi.api.infrastructure.Serializer
import app.fivvi.api.models.MeResponse
import app.fivvi.api.models.MyWorkspace
import app.fivvi.api.models.UpdateMeRequest
import app.fivvi.api.models.ValidationError
import java.io.IOException
import java.util.UUID
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.SerializationException
import retrofit2.Response

/** What the account is on a workspace's team; the screen turns it into the catalog's label. */
enum class ProfileRole { Owner, Trainer }

/** How the last change of the Owner's *I also train here* switch of one workspace went. */
enum class TrainsHereChange { Idle, Saving, Saved, NoConnection, Failed }

/**
 * One workspace of *Profiel*: [slug] only tells the rows apart (test tags). [trainsHere] is what the API said (F005): always
 * true for a Trainer, the Owner's own switch for an Owner. [canSwitchTrainsHere] is whether the API lists `team.manage` for
 * the account in this workspace (F004 AC10); the role is only the label and decides nothing.
 */
data class ProfileWorkspace(
    val id: UUID,
    val slug: String,
    val name: String,
    val role: ProfileRole,
    val trainsHere: Boolean,
    val canSwitchTrainsHere: Boolean,
    val change: TrainsHereChange = TrainsHereChange.Idle,
)

sealed interface ProfileState {
    data object Loading : ProfileState

    /** [name] is null until the account has one; [nameSaved] is true after a name was saved, until the next edit. */
    data class Loaded(
        val name: String?,
        val email: String,
        val workspaces: List<ProfileWorkspace>,
        val nameSaved: Boolean = false,
    ) : ProfileState

    data object Failed : ProfileState
}

/** Why saving the name did not go through; the field message or the failure line under it. */
enum class NameError { Required, TooLong, NoConnection, Failed }

/** The full-screen dialog that changes the name: what is typed, whether it is being saved, and why the last save failed. */
data class NameEditor(val input: String, val saving: Boolean = false, val error: NameError? = null)

/**
 * *Profiel* (TM-04): the person's name (editable) and email address (F005), and the workspaces the account is on the team of
 * with its role (F003 AC9), each Owner workspace with the *I also train here* switch (F005 AC4, AC5). It reads
 * `GET /api/v1/me` and `GET /api/v1/me/workspaces` on opening ([init]) and on foreground ([refresh]), saves the name with
 * `PATCH /api/v1/me` and the switch with `PUT` / `DELETE /api/v1/workspaces/{id}/trainer-profile`, all through the
 * generated clients. The app has no rule of its own about the name (the API words a refusal) or about who is on which
 * team, and no switching of workspaces (F012).
 */
class ProfileViewModel(private val me: MeApi, private val trainers: TrainersApi) : ViewModel() {
    private val _state = MutableStateFlow<ProfileState>(ProfileState.Loading)
    val state: StateFlow<ProfileState> = _state.asStateFlow()

    private val _editor = MutableStateFlow<NameEditor?>(null)

    /** The name dialog while it is open, null otherwise. A foreground read leaves it, and what is typed in it, alone. */
    val editor: StateFlow<NameEditor?> = _editor.asStateFlow()

    private var loading: Job? = null

    init {
        load(showLoading = true)
    }

    fun retry() = load(showLoading = true)

    /** The app came back to the foreground: read again. What is on screen stays while it loads and when it fails. */
    fun refresh() = load(showLoading = false)

    private fun load(showLoading: Boolean) {
        loading?.cancel()
        if (showLoading || _state.value !is ProfileState.Loaded) _state.value = ProfileState.Loading
        loading = viewModelScope.launch {
            val loaded = fetch()
            if (loaded != null) {
                _state.update { current ->
                    val before = current as? ProfileState.Loaded
                    // A switch that is being saved stays so until the API has answered it (the answer sets the row).
                    val saving = before?.workspaces.orEmpty()
                        .filter { it.change == TrainsHereChange.Saving }
                        .map { it.id }
                    loaded.copy(
                        workspaces = loaded.workspaces.map {
                            if (it.id in saving) it.copy(change = TrainsHereChange.Saving) else it
                        },
                        nameSaved = before?.nameSaved == true,
                    )
                }
            } else if (_state.value is ProfileState.Loading) {
                _state.value = ProfileState.Failed
            }
        }
    }

    private suspend fun fetch(): ProfileState.Loaded? = try {
        val account = me.getMe().let { response -> response.body()?.takeIf { response.isSuccessful } }
        val workspaces = me.listMyWorkspaces().let { response -> response.body()?.takeIf { response.isSuccessful } }
        if (account == null || workspaces == null) {
            null
        } else {
            ProfileState.Loaded(account.name, account.email, workspaces.map { it.toProfileWorkspace() })
        }
    } catch (_: IOException) {
        null
    } catch (_: SerializationException) {
        null
    }

    private fun MyWorkspace.toProfileWorkspace() = ProfileWorkspace(
        id = workspaceId,
        slug = slug,
        name = name,
        role = when (role) {
            MyWorkspace.Role.OWNER -> ProfileRole.Owner
            MyWorkspace.Role.TRAINER -> ProfileRole.Trainer
        },
        trainsHere = trainsHere,
        canSwitchTrainsHere = MyWorkspace.Capabilities.TEAM_PERIOD_MANAGE in capabilities,
    )

    /** The name row was tapped: the dialog opens with the name as it is. */
    fun startEditingName() {
        val loaded = _state.value as? ProfileState.Loaded ?: return
        _state.value = loaded.copy(nameSaved = false)
        _editor.value = NameEditor(input = loaded.name.orEmpty())
    }

    /** Typing clears the message of the last refusal; nothing is checked here, the API's rules are the only ones. */
    fun onNameInput(input: String) {
        _editor.update { editor -> editor?.takeIf { !it.saving }?.copy(input = input, error = null) ?: editor }
    }

    fun cancelEditingName() {
        _editor.value = null
    }

    fun saveName() {
        val editor = _editor.value?.takeIf { !it.saving } ?: return
        _editor.value = editor.copy(saving = true, error = null)
        viewModelScope.launch {
            val response = try {
                me.updateMe(UpdateMeRequest(name = editor.input))
            } catch (_: IOException) {
                return@launch failName(NameError.NoConnection)
            } catch (_: SerializationException) {
                return@launch failName(NameError.Failed)
            }
            val account = response.body()?.takeIf { response.isSuccessful }
            if (account == null) return@launch failName(refusalOf(response))
            _state.update { current ->
                (current as? ProfileState.Loaded)?.copy(name = account.name, nameSaved = true) ?: current
            }
            _editor.value = null
        }
    }

    /** The save failed: the dialog stays open with what was typed, and says why. */
    private fun failName(error: NameError) {
        _editor.update { it?.copy(saving = false, error = error) }
    }

    /** `400 validation_failed` names the refused field: `too_small` is an empty or blank name, `too_big` a long one. */
    private fun refusalOf(response: Response<MeResponse>): NameError {
        if (response.code() != 400) return NameError.Failed
        val issues = try {
            val body = response.errorBody()?.string() ?: return NameError.Failed
            Serializer.kotlinxSerializationJson.decodeFromString<ValidationError>(body).issues
        } catch (_: SerializationException) {
            return NameError.Failed
        } catch (_: IllegalArgumentException) {
            return NameError.Failed
        }
        val code = issues.lastOrNull { it.path == "name" }?.code ?: return NameError.Failed
        return if (code == "too_big") NameError.TooLong else NameError.Required
    }

    /**
     * The Owner's switch: [on] puts the trainer profile, off deletes it (F005 AC4). The switch follows what the API
     * accepted: until then it shows the old state, and a failed save leaves it so, with a message. A refusal (403, or 404
     * when the person lost their place) reads the list again. Where the API does not list `team.manage` (a Trainer, AC5) there is no switch, so nothing is sent for one.
     */
    fun setTrainsHere(workspaceId: UUID, on: Boolean) {
        val workspace = (_state.value as? ProfileState.Loaded)?.workspaces?.firstOrNull { it.id == workspaceId }
        if (workspace == null || !workspace.canSwitchTrainsHere || workspace.change == TrainsHereChange.Saving) return
        changeWorkspace(workspaceId) { it.copy(change = TrainsHereChange.Saving) }
        viewModelScope.launch {
            val response = try {
                if (on) trainers.putTrainerProfile(workspaceId) else trainers.deleteTrainerProfile(workspaceId)
            } catch (_: IOException) {
                return@launch changeWorkspace(workspaceId) { it.copy(change = TrainsHereChange.NoConnection) }
            } catch (_: SerializationException) {
                return@launch changeWorkspace(workspaceId) { it.copy(change = TrainsHereChange.Failed) }
            }
            if (response.isSuccessful) {
                changeWorkspace(workspaceId) { it.copy(trainsHere = on, change = TrainsHereChange.Saved) }
            } else {
                changeWorkspace(workspaceId) { it.copy(change = TrainsHereChange.Failed) }
                if (response.code() == 403 || response.code() == 404) load(showLoading = false)
            }
        }
    }

    private fun changeWorkspace(id: UUID, change: (ProfileWorkspace) -> ProfileWorkspace) {
        _state.update { current ->
            if (current !is ProfileState.Loaded) return@update current
            current.copy(workspaces = current.workspaces.map { if (it.id == id) change(it) else it })
        }
    }
}

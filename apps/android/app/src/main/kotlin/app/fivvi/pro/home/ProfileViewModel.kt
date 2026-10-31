package app.fivvi.pro.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fivvi.api.apis.MeApi
import app.fivvi.api.models.MyWorkspace
import java.io.IOException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.SerializationException

/** What the account is on a workspace's team; the screen turns it into the catalog's label. */
enum class ProfileRole { Owner, Trainer }

/** One workspace of *Profiel*: [slug] only tells the rows apart (test tags). */
data class ProfileWorkspace(val slug: String, val name: String, val role: ProfileRole)

sealed interface ProfileState {
    data object Loading : ProfileState

    data class Loaded(val workspaces: List<ProfileWorkspace>) : ProfileState

    data object Failed : ProfileState
}

/**
 * *Profiel* (TM-04, F003 AC9): the workspaces the account is on the team of, with its role, from
 * `GET /api/v1/me/workspaces` through the generated client. It reads them on opening ([init]) and on foreground
 * ([refresh]); the app has no rule of its own about who is on which team, and no switching (F012).
 */
class ProfileViewModel(private val api: MeApi) : ViewModel() {
    private val _state = MutableStateFlow<ProfileState>(ProfileState.Loading)
    val state: StateFlow<ProfileState> = _state.asStateFlow()
    private var loading: Job? = null

    init {
        load(showLoading = true)
    }

    fun retry() = load(showLoading = true)

    /** The app came back to the foreground: read the list again. A list on screen stays while it loads and when it fails. */
    fun refresh() = load(showLoading = false)

    private fun load(showLoading: Boolean) {
        loading?.cancel()
        if (showLoading || _state.value !is ProfileState.Loaded) _state.value = ProfileState.Loading
        loading = viewModelScope.launch {
            val loaded = fetch()
            if (loaded != null) {
                _state.value = loaded
            } else if (_state.value is ProfileState.Loading) {
                _state.value = ProfileState.Failed
            }
        }
    }

    private suspend fun fetch(): ProfileState.Loaded? {
        val response = try {
            api.listMyWorkspaces()
        } catch (_: IOException) {
            return null
        } catch (_: SerializationException) {
            return null
        }
        val workspaces = response.body()?.takeIf { response.isSuccessful } ?: return null
        return ProfileState.Loaded(workspaces.map { ProfileWorkspace(it.slug, it.name, it.role.toProfileRole()) })
    }

    private fun MyWorkspace.Role.toProfileRole() = when (this) {
        MyWorkspace.Role.OWNER -> ProfileRole.Owner
        MyWorkspace.Role.TRAINER -> ProfileRole.Trainer
    }
}

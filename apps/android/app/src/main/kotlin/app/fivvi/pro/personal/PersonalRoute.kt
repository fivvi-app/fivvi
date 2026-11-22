package app.fivvi.pro.personal

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fivvi.api.models.MeWorkspace
import app.fivvi.pro.Routes
import app.fivvi.pro.home.WorkspacesRead
import java.util.UUID
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * A screen Vandaag opens (F013): TD-02 for a private session and TD-03 for a class date, each with the item's workspace as
 * an explicit part of the route. The current workspace (F012) is not changed by opening one, and back returns to Vandaag.
 */
object PersonalRoute {
    fun session(workspaceId: UUID, id: UUID): String = Routes.inWorkspace(workspaceId, Routes.session(id))

    fun classDate(workspaceId: UUID, id: UUID): String = Routes.inWorkspace(workspaceId, Routes.classDate(id, null))

    fun of(row: PersonalRow): String =
        if (row.isGroup) classDate(row.workspaceId, row.id) else session(row.workspaceId, row.id)
}

/**
 * Reads the item's workspace for a [PersonalRoute]: the person's role, team-member ID and capabilities there are the ones
 * its screen uses. When it can't be read it says why (offline, or the details couldn't be loaded) and *Opnieuw* reads the
 * account again; [known] is what the last read of the account listed and [reload] reads it again.
 */
class PersonalDestinationViewModel(
    private val workspaceId: UUID,
    private val known: () -> List<MeWorkspace>,
    private val reload: suspend () -> WorkspacesRead,
) : ViewModel() {
    sealed interface State {
        data object Loading : State

        data class Ready(val workspace: MeWorkspace) : State

        /** The person is not on it (any more). */
        data object Unavailable : State

        data object Offline : State
    }

    private val _state = MutableStateFlow<State>(State.Loading)
    val state: StateFlow<State> = _state.asStateFlow()

    init {
        // The account may not have answered yet (Vandaag can be read from the phone's copy): then it is asked.
        if (known().isEmpty()) retry() else _state.value = resolve(known())
    }

    fun retry() {
        _state.value = State.Loading
        viewModelScope.launch {
            _state.value = when (val read = reload()) {
                is WorkspacesRead.Listed -> resolve(read.workspaces)
                WorkspacesRead.Offline -> State.Offline
                WorkspacesRead.Failed -> State.Unavailable
            }
        }
    }

    private fun resolve(workspaces: List<MeWorkspace>): State =
        workspaces.firstOrNull { it.id == workspaceId }?.let(State::Ready) ?: State.Unavailable
}

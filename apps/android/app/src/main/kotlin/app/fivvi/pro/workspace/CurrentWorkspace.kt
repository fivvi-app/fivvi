package app.fivvi.pro.workspace

import android.content.Context
import java.util.UUID
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * What the app keeps on this device about the current workspace (F012): the ID of the workspace used last. Not a secret
 * and never sent to the server, so plain preferences; it stays after a sign-out.
 */
interface LastWorkspaceStore {
    var id: UUID?
}

class SharedPreferencesLastWorkspaceStore(context: Context) : LastWorkspaceStore {
    private val preferences = context.getSharedPreferences("workspace", Context.MODE_PRIVATE)

    override var id: UUID?
        get() = preferences.getString(LAST_WORKSPACE_ID, null)?.let {
            try {
                UUID.fromString(it)
            } catch (_: IllegalArgumentException) {
                null
            }
        }
        set(value) = preferences.edit().putString(LAST_WORKSPACE_ID, value?.toString()).apply()

    private companion object {
        const val LAST_WORKSPACE_ID = "lastWorkspaceID"
    }
}

/**
 * The one store of the workspace the app is in (F012): every tab reads it, today the home with *Klanten*. [remembered] is
 * the workspace used last on this device; [StartWorkspace] picks from the account's list with it, and a switch in Profiel
 * calls [remember]. It is kept across sign-outs and never goes to the server.
 */
class CurrentWorkspace(private val store: LastWorkspaceStore) {
    private val _remembered = MutableStateFlow(store.id)
    val remembered: StateFlow<UUID?> = _remembered.asStateFlow()

    fun remember(id: UUID) {
        store.id = id
        _remembered.value = id
    }
}

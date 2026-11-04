package app.fivvi.pro.workspace

import app.fivvi.api.models.MeWorkspace
import java.util.UUID

/**
 * Which workspace the app opens on (F012, spec #423): the one the person used last on this phone while they are still on
 * its team, otherwise the first one `GET /api/v1/me` lists. A small pure function that only picks from that list, so it
 * holds no business rule: who is on which team, and the order by name (the API sorts them), are the server's answer.
 */
object StartWorkspace {
    /**
     * The workspaces in the order the app tries them: the [remembered] one first, when it is in the list, then the others
     * in the order the API sent them. The app does not sort them again.
     */
    fun order(workspaces: List<MeWorkspace>, remembered: UUID?): List<MeWorkspace> {
        val index = workspaces.indexOfFirst { it.id == remembered }
        if (index < 0) return workspaces
        return listOf(workspaces[index]) + workspaces.filterIndexed { i, _ -> i != index }
    }

    /** The workspace to open on, or null when the person is on no team. */
    fun pick(workspaces: List<MeWorkspace>, remembered: UUID?): MeWorkspace? =
        order(workspaces, remembered).firstOrNull()
}

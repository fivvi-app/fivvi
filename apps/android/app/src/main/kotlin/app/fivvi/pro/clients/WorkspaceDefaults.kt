package app.fivvi.pro.clients

import app.fivvi.api.apis.WorkspacesApi
import app.fivvi.api.models.Locale
import app.fivvi.api.models.TrainerWord
import java.io.IOException
import java.time.DateTimeException
import java.time.ZoneId
import java.util.UUID
import kotlinx.serialization.SerializationException

/**
 * What the clients screens take from the workspace: the default communication language, which the *Standaard (…)* option
 * names, the time zone the times are shown in and the word it uses for the people who teach (F068). Until the workspace has
 * been read, or when it can't be, these are the product's defaults (Dutch, Europe/Amsterdam, *trainer*; `AGENTS.md`).
 */
data class WorkspaceDefaults(
    val defaultLocale: Locale = Locale.NL_NL,
    val zone: ZoneId = ZoneId.of("Europe/Amsterdam"),
    val trainerWord: TrainerWord = TrainerWord.TRAINER,
)

/** `GET /api/v1/workspaces/{id}` through the generated client; the product defaults when it can't be read. */
suspend fun WorkspacesApi.defaultsOf(workspaceId: UUID): WorkspaceDefaults {
    val response = try {
        getWorkspace(workspaceId)
    } catch (_: IOException) {
        return WorkspaceDefaults()
    } catch (_: SerializationException) {
        return WorkspaceDefaults()
    }
    val workspace = response.body()?.takeIf { response.isSuccessful } ?: return WorkspaceDefaults()
    val zone = try {
        ZoneId.of(workspace.timeZone)
    } catch (_: DateTimeException) {
        WorkspaceDefaults().zone
    }
    return WorkspaceDefaults(workspace.defaultLocale, zone, workspace.trainerWord)
}

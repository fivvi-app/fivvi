package app.fivvi.pro.classes

import androidx.activity.compose.BackHandler
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.fivvi.api.models.MeWorkspace
import app.fivvi.core.ui.OnForeground
import app.fivvi.pro.capabilities.WorkspaceCapabilities
import java.util.UUID

/**
 * **+** → *Groepsles* (TD-05, F021): the form of the Owner, one full-screen surface. System back leaves it (with a
 * confirmation first when something was entered). When the API has created the class and its date, [onSaved] is told the
 * date's ID and how many dates it added (12 for a weekly class): the host opens TD-03 of it. [sessionKey] belongs to one
 * sign-in and [opening] to one opening of the form, so each opening starts with an empty form. [teamMemberId] is the
 * person's own team-member ID in the workspace.
 */
@Composable
fun NewGroupClassFlow(
    apis: ClassApis,
    capabilities: WorkspaceCapabilities,
    workspaceId: UUID,
    workspaceName: String,
    teamMemberId: UUID,
    email: String,
    accountName: String?,
    sessionKey: String,
    opening: Int,
    onClose: () -> Unit,
    onSaved: (UUID, Int) -> Unit,
) {
    val model = viewModel(key = "newClass-$sessionKey-$workspaceId-$opening") {
        NewGroupClassViewModel(
            apis,
            workspaceId,
            teamMemberId,
            onNotAllowed = {
                capabilities.onResponse(it, workspaceId, MeWorkspace.Capabilities.CLASS_PERIOD_MANAGE)
            },
        )
    }
    val state by model.state.collectAsStateWithLifecycle()
    var confirmingDiscard by rememberSaveable { mutableStateOf(false) }

    // Back from the app switcher: a form that was offline reads again.
    OnForeground { if (state.isOffline) model.start() }
    LaunchedEffect(state.saved) {
        state.saved?.let {
            model.onSavedHandled()
            onSaved(it.id, state.datesAdded)
        }
    }

    fun leave() {
        if (state.isDirty) confirmingDiscard = true else onClose()
    }

    BackHandler(onBack = ::leave)
    NewGroupClassScreen(
        state = state,
        ownName = accountName ?: email,
        workspaceName = workspaceName,
        confirmingDiscard = confirmingDiscard,
        onDismissDiscard = { confirmingDiscard = false },
        onDiscard = {
            confirmingDiscard = false
            onClose()
        },
        actions = NewGroupClassActions(
            onClose = ::leave,
            onSave = { model.save() },
            onSaveAnyway = { model.save(allowConflicts = true) },
            onDismissDoubleBooking = model::dismissDoubleBooking,
            onRetry = model::start,
            onNameNl = model::setNameNl,
            onNameEn = model::setNameEn,
            onDescriptionNl = model::setDescriptionNl,
            onDescriptionEn = model::setDescriptionEn,
            onCapacity = model::setCapacity,
            onTrainer = model::setTrainer,
            onDate = model::setDate,
            onStart = model::setStart,
            onEnd = model::setEnd,
            onRepeatsWeekly = model::setRepeatsWeekly,
        ),
    )
}

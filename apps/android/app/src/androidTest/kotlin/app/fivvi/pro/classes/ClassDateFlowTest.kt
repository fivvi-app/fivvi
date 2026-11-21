package app.fivvi.pro.classes

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import app.fivvi.api.models.MeWorkspace
import app.fivvi.api.models.TrainerWord
import app.fivvi.core.AppLanguage
import app.fivvi.core.appLanguageParameters
import app.fivvi.core.me.FakeMeApi
import app.fivvi.core.me.workspaceIdOf
import app.fivvi.pro.capabilities.WorkspaceCapabilities
import app.fivvi.pro.home.FakeTrainersApi
import app.fivvi.pro.home.FakeWorkspacesApi
import app.fivvi.pro.sessions.FakeLocationsApi
import app.fivvi.pro.sessions.FakeSessionsApi
import app.fivvi.pro.sessions.trainerOf
import app.fivvi.pro.showAtLargestFontScale
import app.fivvi.pro.waitUntilTagExists
import java.util.UUID
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// What TD-03 shows through the flow's own capability check (F021 AC7), without the rest of the app: the ⋯ and the note
// of the Owner follow `class.manage` of what the API lists, never the role.
@RunWith(Parameterized::class)
class ClassDateFlowTest(@Suppress("UNUSED_PARAMETER") tag: String, private val language: AppLanguage) {
    @get:Rule
    val compose = createComposeRule()

    private val gym = workspaceIdOf("John's Gym")
    private val sarah = trainerOf("Sarah")
    private val sessions = FakeSessionsApi()
    private val classes = FakeGroupClassesApi(sessions)
    private val mobility = groupClassOf("Mobility", trainer = sarah)

    private fun show(capabilities: List<MeWorkspace.Capabilities>, role: MeWorkspace.Role) {
        classes.classes[mobility.id] = mobility
        val date = classDateOf(UUID.randomUUID(), mobility, sarah)
        sessions.sessions[date.id] = date
        val apis = ClassApis(classes, sessions, FakeLocationsApi(), FakeTrainersApi(), FakeWorkspacesApi())
        compose.showAtLargestFontScale(language, height = 1_800.dp) {
            val listed = viewModel(key = "capabilities") { WorkspaceCapabilities(FakeMeApi()) }
            listed.replace(
                listOf(MeWorkspace(gym, "John's Gym", "slug", TrainerWord.TRAINER, role, sarah.id, capabilities)),
            )
            ClassDateFlow(
                apis,
                listed,
                gym,
                "John's Gym",
                date.id,
                sarah.id,
                added = false,
                sessionKey = "token-1",
                opening = 1,
                onBack = {},
            )
        }
        compose.waitUntilTagExists(ClassDateTags.TITLE)
    }

    // AC7: Sarah reads the date, with no ⋯ and no note about what the Owner manages.
    @Test
    fun test_F021_AC7_aTrainerWhoseCapabilitiesLackClassManageSeesNoMenuAndNoOwnerNoteInTheFlow() {
        show(
            listOf(MeWorkspace.Capabilities.CLASS_PERIOD_READ, MeWorkspace.Capabilities.TRAINERS_PERIOD_VIEW),
            MeWorkspace.Role.TRAINER,
        )

        compose.onNodeWithTag(ClassDateTags.TITLE).assertTextEquals("Mobility")
        compose.onNodeWithTag(ClassDateTags.MENU).assertDoesNotExist()
        compose.onNodeWithTag(ClassDateTags.OWNER_NOTE).assertDoesNotExist()
    }

    @Test
    fun test_F021_AC7_anOwnerWithClassManageSeesTheMenuAndTheNoteInTheFlow() {
        show(MeWorkspace.Capabilities.values().toList(), MeWorkspace.Role.OWNER)

        compose.onNodeWithTag(ClassDateTags.MENU).assertIsDisplayed()
        compose.onNodeWithTag(ClassDateTags.OWNER_NOTE).assertIsDisplayed()
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}

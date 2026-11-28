package app.fivvi.pro.classes

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import app.fivvi.api.models.ClassLevel
import app.fivvi.api.models.MeWorkspace
import app.fivvi.api.models.TrainerWord
import app.fivvi.core.AppLanguage
import app.fivvi.core.appLanguageParameters
import app.fivvi.core.me.FakeMeApi
import app.fivvi.core.me.workspaceIdOf
import app.fivvi.core.net.FakeConnectivity
import app.fivvi.pro.capabilities.WorkspaceCapabilities
import app.fivvi.pro.home.FakeTrainersApi
import app.fivvi.pro.home.FakeWorkspacesApi
import app.fivvi.pro.sessions.FakeLocationsApi
import app.fivvi.pro.sessions.FakeSessionsApi
import app.fivvi.pro.sessions.trainerOf
import app.fivvi.pro.showAtLargestFontScale
import app.fivvi.pro.waitUntilTagExists
import java.io.IOException
import java.time.Instant
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

    private fun show(
        capabilities: List<MeWorkspace.Capabilities>,
        role: MeWorkspace.Role,
        level: ClassLevel? = null,
        substituteFor: String? = null,
    ) {
        classes.classes[mobility.id] = mobility
        val date = classDateOf(UUID.randomUUID(), mobility, sarah, level = level, substituteFor = substituteFor)
        sessions.sessions[date.id] = date
        val apis =
            ClassApis(
                classes,
                sessions,
                FakeLocationsApi(),
                FakeTrainersApi(),
                FakeWorkspacesApi(),
                FakeBookingLinksApi(),
            )
        compose.showAtLargestFontScale(language, height = 1_800.dp) {
            // The account read that follows a refusal fails, so what a 403 took away stays away.
            val listed = viewModel(key = "capabilities") {
                WorkspaceCapabilities(FakeMeApi().apply { answers += { throw IOException("offline") } })
            }
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
                added = null,
                sessionKey = "token-1",
                opening = 1,
                onBack = {},
                connectivity = FakeConnectivity(),
                onCancelled = {},
                now = { Instant.parse("2026-11-16T07:20:00Z") },
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

    // F024 AC4: the covering Trainer (no class.manage) reads the banner and Jij, and has no menu; nothing in the flow lets her
    // substitute.
    @Test
    fun test_F024_AC4_aCoveringTrainerReadsTheBannerAndHasNoMenuInTheFlow() {
        show(
            listOf(MeWorkspace.Capabilities.CLASS_PERIOD_READ, MeWorkspace.Capabilities.TRAINERS_PERIOD_VIEW),
            MeWorkspace.Role.TRAINER,
            substituteFor = "Sarah Visser",
        )

        compose.onNodeWithTag(ClassDateTags.SUBSTITUTION).assertIsDisplayed()
        compose.onNodeWithTag(ClassDateTags.TRAINER).assertTextEquals(
            if (language == AppLanguage.DUTCH) "Jij" else "You",
        )
        compose.onNodeWithTag(ClassDateTags.MENU).assertDoesNotExist()
        compose.onNodeWithTag(ClassDateTags.SUBSTITUTE).assertDoesNotExist()
    }

    // F067 AC8: through the flow, a Trainer reads the same level as the Owner and has nothing that changes it.
    @Test
    fun test_F067_AC8_aTrainerReadsTheLevelInTheFlowAndHasNoControlToChangeIt() {
        show(
            listOf(MeWorkspace.Capabilities.CLASS_PERIOD_READ, MeWorkspace.Capabilities.TRAINERS_PERIOD_VIEW),
            MeWorkspace.Role.TRAINER,
            level = ClassLevel.ADVANCED,
        )

        compose.onNodeWithTag(ClassDateTags.EYEBROW)
            .assertTextEquals(if (language == AppLanguage.DUTCH) "Groepsles · Gevorderd" else "Group class · Advanced")
        compose.onNodeWithTag(ClassDateTags.LEVEL).assertIsDisplayed()
        compose.onNodeWithTag(ClassDateTags.MENU).assertDoesNotExist()
        compose.onNodeWithTag(ClassDateTags.EDIT).assertDoesNotExist()
    }

    @Test
    fun test_F067_AC8_theOwnerSeesTheSameLevelInTheFlow() {
        show(MeWorkspace.Capabilities.values().toList(), MeWorkspace.Role.OWNER, level = ClassLevel.ADVANCED)

        compose.onNodeWithTag(ClassDateTags.EYEBROW)
            .assertTextEquals(if (language == AppLanguage.DUTCH) "Groepsles · Gevorderd" else "Group class · Advanced")
        compose.onNodeWithTag(ClassDateTags.LEVEL).assertIsDisplayed()
    }

    // F026 AC5: the cancel calls are guarded by class.manage, so a 403 on them takes *Les annuleren* away at once and
    // leaves class.read: the class stays readable.
    @Test
    fun test_F026_AC5_aRefusedCancelPreviewHidesTheMenuAndKeepsReadingTheClass() {
        classes.previewStatus = 403
        show(MeWorkspace.Capabilities.values().toList(), MeWorkspace.Role.OWNER)

        compose.onNodeWithTag(ClassDateTags.MENU).performClick()
        compose.waitUntilTagExists(ClassDateTags.CANCEL)
        compose.onNodeWithTag(ClassDateTags.CANCEL).performClick()

        compose.waitUntilTagExists(ClassDateTags.CANCEL_FAILED)
        compose.onNodeWithTag(ClassDateTags.MENU).assertDoesNotExist()
        compose.onNodeWithTag(ClassDateTags.TITLE).assertTextEquals("Mobility")
    }

    @Test
    fun test_F026_AC5_aRefusedCancellationHidesTheMenuAndKeepsReadingTheClass() {
        show(MeWorkspace.Capabilities.values().toList(), MeWorkspace.Role.OWNER)

        compose.onNodeWithTag(ClassDateTags.MENU).performClick()
        compose.waitUntilTagExists(ClassDateTags.CANCEL)
        compose.onNodeWithTag(ClassDateTags.CANCEL).performClick()
        compose.waitUntilTagExists(ClassDateTags.CANCEL_SUBMIT)
        classes.cancelStatus = 403
        compose.onNodeWithTag(ClassDateTags.CANCEL_SUBMIT).performClick()

        compose.waitUntilTagExists(ClassDateTags.CANCEL_FAILED)
        compose.onNodeWithTag(ClassDateTags.MENU).assertDoesNotExist()
        compose.onNodeWithTag(ClassDateTags.TITLE).assertTextEquals("Mobility")
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}

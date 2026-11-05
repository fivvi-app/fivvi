package app.fivvi.pro.home

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextReplacement
import app.fivvi.api.models.MyWorkspace
import app.fivvi.api.models.MyWorkspace.Role
import app.fivvi.core.AppLanguage
import app.fivvi.core.R
import app.fivvi.core.appLanguageParameters
import app.fivvi.core.me.FakeMeApi
import app.fivvi.core.me.workspaceIdOf
import app.fivvi.pro.AppRule
import app.fivvi.pro.UI_TIMEOUT_MILLIS
import app.fivvi.pro.hello.FakeHelloApi
import app.fivvi.pro.localizedString
import app.fivvi.pro.waitUntilTagExists
import kotlinx.coroutines.CompletableDeferred
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// Sarah is Trainer of John's Gym and Owner of Sarah Personal Training (F003 seed).
@RunWith(Parameterized::class)
class ProfileScreenTest(@Suppress("UNUSED_PARAMETER") tag: String, private val language: AppLanguage) {
    @get:Rule
    val compose = createEmptyComposeRule()

    @get:Rule
    val app = AppRule()

    private val hello = FakeHelloApi().apply { answerGreeting() }
    private val me = FakeMeApi()
    private val workspaces = FakeWorkspacesApi()
    private val trainers = FakeTrainersApi()

    private fun launch() = app.launch(
        hello,
        device = listOf(language.tag),
        meApi = me,
        workspacesApi = workspaces,
        trainersApi = trainers,
    )

    // Sarah (F003 seed): Trainer of John's Gym, Owner of Sarah Personal Training.
    private val johnsGym = Triple("John's Gym", "johns-gym", Role.TRAINER)
    private val sarahPersonalTraining = Triple("Sarah Personal Training", "sarah-personal-training", Role.OWNER)

    // The home reads the account on opening and Profiel reads it again when it opens.
    private fun openProfileAsSarah(
        trainingOwners: Set<String> = emptySet(),
        capabilities: Map<String, List<MyWorkspace.Capabilities>> = emptyMap(),
    ) {
        repeat(2) {
            me.answerAccount(
                name = "Sarah",
                email = "trainer@example.com",
                workspaces = listOf("John's Gym", "Sarah Personal Training"),
            )
        }
        me.answerWorkspaces(trainingOwners, johnsGym, sarahPersonalTraining, capabilities = capabilities)
        launch()
        compose.waitUntilTagExists(HomeTags.OPEN_PROFILE)
        compose.onNodeWithTag(HomeTags.OPEN_PROFILE).performClick()
        compose.waitUntilTagExists("${ProfileTags.WORKSPACE_NAME}.sarah-personal-training")
    }

    private fun string(id: Int, vararg args: Any) = localizedString(language, id, *args)

    @Test
    fun test_F003_AC9_profileListsWorkspacesWithRole() {
        me.answerAccount(workspaces = listOf("John's Gym", "Sarah Personal Training"))
        me.answerAccount(workspaces = listOf("John's Gym", "Sarah Personal Training"))
        me.answerWorkspaces(
            Triple("John's Gym", "johns-gym", Role.TRAINER),
            Triple("Sarah Personal Training", "sarah-personal-training", Role.OWNER),
        )
        launch()

        compose.waitUntilTagExists(HomeTags.OPEN_PROFILE)
        compose.onNodeWithTag(HomeTags.OPEN_PROFILE).performClick()

        compose.onNodeWithTag(ProfileTags.TITLE).assertTextEquals(string(R.string.my_profile_title))
        compose.onNodeWithTag(
            ProfileTags.WORKSPACES_TITLE,
        ).assertTextEquals(string(R.string.my_profile_workspaces_title))
        compose.waitUntilTagExists("${ProfileTags.WORKSPACE_NAME}.johns-gym")
        compose.onNodeWithTag("${ProfileTags.WORKSPACE_NAME}.johns-gym").assertTextEquals("John's Gym")
        compose.onNodeWithTag(
            "${ProfileTags.WORKSPACE_ROLE}.johns-gym",
        ).assertTextEquals(string(R.string.roles_trainer))
        compose.onNodeWithTag("${ProfileTags.WORKSPACE_NAME}.sarah-personal-training")
            .assertTextEquals("Sarah Personal Training")
        compose.onNodeWithTag("${ProfileTags.WORKSPACE_ROLE}.sarah-personal-training")
            .assertTextEquals(string(R.string.roles_owner))
    }

    // F004 AC8: Sarah sees Eigenaar / Owner for Sarah Personal Training and Trainer for John's Gym, in both languages.
    @Test
    fun test_F004_AC8_roleLabelsPerWorkspace() {
        me.answerAccount(workspaces = listOf("John's Gym", "Sarah Personal Training"))
        me.answerAccount(workspaces = listOf("John's Gym", "Sarah Personal Training"))
        me.answerWorkspaces(
            Triple("John's Gym", "johns-gym", Role.TRAINER),
            Triple("Sarah Personal Training", "sarah-personal-training", Role.OWNER),
        )
        launch()
        compose.waitUntilTagExists(HomeTags.OPEN_PROFILE)

        compose.onNodeWithTag(HomeTags.OPEN_PROFILE).performClick()

        compose.waitUntilTagExists("${ProfileTags.WORKSPACE_ROLE}.johns-gym")
        compose.onNodeWithTag("${ProfileTags.WORKSPACE_ROLE}.johns-gym")
            .assertTextEquals(string(R.string.roles_trainer))
        compose.onNodeWithTag("${ProfileTags.WORKSPACE_ROLE}.sarah-personal-training")
            .assertTextEquals(string(R.string.roles_owner))
    }

    @Test
    fun test_F003_AC9_openingTheProfileAgainReadsTheListAgain() {
        repeat(3) { me.answerAccount() }
        me.answerWorkspaces(Triple("John's Gym", "johns-gym", Role.OWNER))
        me.answerWorkspaces(Triple("Sarah Personal Training", "sarah-personal-training", Role.OWNER))
        launch()
        compose.waitUntilTagExists(HomeTags.OPEN_PROFILE)
        compose.onNodeWithTag(HomeTags.OPEN_PROFILE).performClick()
        compose.waitUntilTagExists("${ProfileTags.WORKSPACE_NAME}.johns-gym")
        app.pressBack()
        compose.waitUntilTagExists(HomeTags.OPEN_PROFILE)

        compose.onNodeWithTag(HomeTags.OPEN_PROFILE).performClick()

        compose.waitUntilTagExists("${ProfileTags.WORKSPACE_NAME}.sarah-personal-training")
        compose.onNodeWithTag("${ProfileTags.WORKSPACE_NAME}.johns-gym").assertDoesNotExist()
    }

    @Test
    fun test_F003_AC9_backLeavesTheProfile() {
        repeat(2) { me.answerAccount() }
        me.answerWorkspaces(Triple("John's Gym", "johns-gym", Role.OWNER))
        launch()
        compose.waitUntilTagExists(HomeTags.OPEN_PROFILE)
        compose.onNodeWithTag(HomeTags.OPEN_PROFILE).performClick()
        compose.waitUntilTagExists(ProfileTags.TITLE)

        app.pressBack()

        compose.waitUntilTagExists(HomeTags.SIGN_OUT)
        compose.onNodeWithTag(ProfileTags.TITLE).assertDoesNotExist()
    }

    @Test
    fun test_F003_AC6_workspaceGoneShowsNoAccess() {
        me.answerAccount(workspaces = listOf("John's Gym"))
        // On foreground the home reads the account again after the 404, and so does the language (F010 AC2).
        me.answerAccount(workspaces = emptyList(), canCreateWorkspace = false)
        me.answerAccount(workspaces = emptyList(), canCreateWorkspace = false)
        workspaces.answerGone()
        launch()
        compose.waitUntilTagExists(HomeTags.WORKSPACE_NAME)

        app.backgroundAndForeground()

        compose.waitUntilTagExists(HomeTags.NO_ACCESS)
        compose.onNodeWithText(string(R.string.no_access_title)).assertIsDisplayed()
        compose.onNodeWithText(string(R.string.no_access_body)).assertIsDisplayed()
        compose.onNodeWithTag(HomeTags.SIGN_OUT).assertIsDisplayed()
    }

    // F005 AC1 (NL, EN): Profiel shows the name and the email address; changing the name in the dialog and saving updates Profiel.
    @Test
    fun test_F005_AC1_editNameUpdatesProfile() {
        openProfileAsSarah()
        compose.onNodeWithTag(ProfileTags.DETAILS_TITLE).assertTextEquals(string(R.string.my_profile_details_title))
        compose.onNodeWithTag(ProfileTags.NAME).assertTextEquals("Sarah")
        compose.onNodeWithTag(ProfileTags.EMAIL).assertTextEquals("trainer@example.com")

        compose.onNodeWithTag(ProfileTags.NAME).performClick()

        compose.waitUntilTagExists(ProfileTags.NAME_INPUT)
        compose.onNodeWithTag(ProfileTags.NAME_EDITOR).assertTextEquals(string(R.string.my_profile_edit_name))
        compose.onNodeWithTag(ProfileTags.NAME_SAVE).assertTextEquals(string(R.string.my_profile_save))
        compose.onNodeWithTag(ProfileTags.NAME_CANCEL).assertTextEquals(string(R.string.common_cancel))
        compose.onNodeWithTag(ProfileTags.NAME_INPUT).performTextReplacement("Sarah de Vries")
        compose.onNodeWithTag(ProfileTags.NAME_SAVE).performClick()

        compose.waitUntilTagExists(ProfileTags.NAME_SAVED)
        compose.onNodeWithTag(ProfileTags.NAME).assertTextEquals("Sarah de Vries")
        compose.onNodeWithTag(ProfileTags.NAME_SAVED).assertTextEquals(string(R.string.my_profile_saved))
        compose.onNodeWithTag(ProfileTags.NAME_INPUT).assertDoesNotExist()
        assertEquals(listOf("Sarah de Vries"), me.updates.map { it.name })
    }

    // F005 AC1 (NL, EN): an empty name is refused with the field message, and what was typed stays.
    @Test
    fun test_F005_AC1_emptyNameIsRefusedWithAFieldMessage() {
        openProfileAsSarah()
        compose.onNodeWithTag(ProfileTags.NAME).performClick()
        compose.waitUntilTagExists(ProfileTags.NAME_INPUT)
        me.refuseNextUpdate(code = "too_small")
        compose.onNodeWithTag(ProfileTags.NAME_INPUT).performTextReplacement("  ")

        compose.onNodeWithTag(ProfileTags.NAME_SAVE).performClick()

        compose.waitUntilTagExists(ProfileTags.NAME_ERROR)
        compose.onNodeWithTag(ProfileTags.NAME_ERROR).assertTextEquals(string(R.string.my_profile_errors_name_required))

        // Typing again takes the message away; a name over 80 characters has its own message.
        me.refuseNextUpdate(code = "too_big")
        compose.onNodeWithTag(ProfileTags.NAME_INPUT).performTextReplacement("x".repeat(81))
        compose.onNodeWithTag(ProfileTags.NAME_ERROR).assertDoesNotExist()
        compose.onNodeWithTag(ProfileTags.NAME_SAVE).performClick()

        compose.waitUntilTagExists(ProfileTags.NAME_ERROR)
        compose.onNodeWithTag(ProfileTags.NAME_ERROR).assertTextEquals(string(R.string.my_profile_errors_name_too_long))
        compose.onNodeWithTag(
            ProfileTags.NAME_INPUT,
        ).assertTextEquals(string(R.string.my_profile_name_label), "x".repeat(81))

        // Cancel leaves the name as it was.
        compose.onNodeWithTag(ProfileTags.NAME_CANCEL).performClick()
        compose.onNodeWithTag(ProfileTags.NAME).assertTextEquals("Sarah")
    }

    // F005 AC1: a save that did not go through (no connection) keeps the input in the dialog.
    @Test
    fun test_F005_AC1_failedSaveKeepsTheInput() {
        openProfileAsSarah()
        compose.onNodeWithTag(ProfileTags.NAME).performClick()
        compose.waitUntilTagExists(ProfileTags.NAME_INPUT)
        me.updateFailure = java.io.IOException("offline")
        compose.onNodeWithTag(ProfileTags.NAME_INPUT).performTextReplacement("Sarah de Vries")

        compose.onNodeWithTag(ProfileTags.NAME_SAVE).performClick()

        compose.waitUntilTagExists(ProfileTags.NAME_ERROR)
        compose.onNodeWithTag(ProfileTags.NAME_ERROR).assertTextEquals(string(R.string.my_profile_errors_no_connection))
        compose.onNodeWithTag(ProfileTags.NAME_INPUT)
            .assertTextEquals(string(R.string.my_profile_name_label), "Sarah de Vries")
    }

    // F005 AC1: back closes the dialog first, then Profiel.
    @Test
    fun test_F005_AC1_backClosesTheDialogBeforeProfiel() {
        openProfileAsSarah()
        compose.onNodeWithTag(ProfileTags.NAME).performClick()
        compose.waitUntilTagExists(ProfileTags.NAME_INPUT)

        app.pressBack()

        compose.waitUntilTagExists(ProfileTags.NAME)
        compose.onNodeWithTag(ProfileTags.NAME_INPUT).assertDoesNotExist()
        assertTrue(me.updates.isEmpty())
    }

    // F005 AC1: back does nothing while the name is being saved, so the person sees how it went.
    @Test
    fun test_F005_AC1_backDoesNothingWhileTheNameIsSaving() {
        openProfileAsSarah()
        compose.onNodeWithTag(ProfileTags.NAME).performClick()
        compose.waitUntilTagExists(ProfileTags.NAME_INPUT)
        val gate = CompletableDeferred<Unit>()
        me.updateGate = gate
        compose.onNodeWithTag(ProfileTags.NAME_INPUT).performTextReplacement("Sarah de Vries")
        compose.onNodeWithTag(ProfileTags.NAME_SAVE).performClick()
        // The dialog is disabled once the screen shows that it is saving.
        compose.waitUntil(UI_TIMEOUT_MILLIS) {
            runCatching { compose.onNodeWithTag(ProfileTags.NAME_SAVE).assertIsNotEnabled() }.isSuccess
        }

        app.pressBack()

        compose.onNodeWithTag(ProfileTags.NAME_INPUT).assertIsDisplayed()
        gate.complete(Unit)
        compose.waitUntilTagExists(ProfileTags.NAME_SAVED)
        compose.onNodeWithTag(ProfileTags.NAME).assertTextEquals("Sarah de Vries")
    }

    // F005 AC4 (NL, EN): an Owner switches training off and on for the workspace.
    @Test
    fun test_F005_AC4_ownerSwitchesTrainingOffAndOn() {
        openProfileAsSarah(trainingOwners = setOf("Sarah Personal Training"))
        val own = "${ProfileTags.TRAINS_HERE}.sarah-personal-training"
        compose.onNodeWithTag(own).assertIsOn()
        compose.onNodeWithText(
            string(R.string.profile_trains_here_label, "Sarah Personal Training"),
        ).assertIsDisplayed()

        compose.onNodeWithTag(own).performClick()

        compose.waitUntilTagExists("${ProfileTags.TRAINS_HERE_SAVED}.sarah-personal-training")
        compose.onNodeWithTag(own).assertIsOff()
        compose.onNodeWithTag("${ProfileTags.TRAINS_HERE_SAVED}.sarah-personal-training")
            .assertTextEquals(string(R.string.profile_trains_here_saved))

        compose.onNodeWithTag(own).performClick()

        compose.waitUntil(UI_TIMEOUT_MILLIS) { trainers.switches.size == 2 }
        compose.onNodeWithTag(own).assertIsOn()
        val id = workspaceIdOf("Sarah Personal Training")
        assertEquals(listOf(id to false, id to true), trainers.switches)
    }

    // F005 AC4: a switch that could not be saved stays as it was, with a message.
    @Test
    fun test_F005_AC4_aFailedSwitchStaysAsItWasWithAMessage() {
        openProfileAsSarah()
        val own = "${ProfileTags.TRAINS_HERE}.sarah-personal-training"
        trainers.failure = { throw java.io.IOException("offline") }

        compose.onNodeWithTag(own).performClick()

        compose.waitUntilTagExists("${ProfileTags.TRAINS_HERE_ERROR}.sarah-personal-training")
        compose.onNodeWithTag("${ProfileTags.TRAINS_HERE_ERROR}.sarah-personal-training")
            .assertTextEquals(string(R.string.profile_trains_here_errors_no_connection))
        compose.onNodeWithTag(own).assertIsOff()
    }

    // F005 AC5 (NL, EN): no switch for a workspace where the person is Trainer; Owner of another one, the switch is there.
    @Test
    fun test_F005_AC5_noSwitchWhereIAmTrainer() {
        openProfileAsSarah()

        compose.onNodeWithTag("${ProfileTags.TRAINS_HERE}.sarah-personal-training").assertIsDisplayed()
        compose.onNodeWithTag(
            "${ProfileTags.WORKSPACE_ROLE}.johns-gym",
        ).assertTextEquals(string(R.string.roles_trainer))
        compose.onNodeWithTag("${ProfileTags.TRAINS_HERE}.johns-gym").assertDoesNotExist()
        compose.onNodeWithText(string(R.string.profile_trains_here_label, "John's Gym")).assertDoesNotExist()
    }

    // F004 AC10 (NL, EN): the switch follows the capability team.manage the API lists, not the role label.
    @Test
    fun test_F004_AC10_theSwitchFollowsTheCapabilityNotTheRole() {
        openProfileAsSarah(
            capabilities = mapOf(
                "John's Gym" to listOf(MyWorkspace.Capabilities.TEAM_PERIOD_MANAGE),
                "Sarah Personal Training" to listOf(MyWorkspace.Capabilities.TEAM_PERIOD_VIEW),
            ),
        )

        compose.onNodeWithTag("${ProfileTags.WORKSPACE_ROLE}.sarah-personal-training")
            .assertTextEquals(string(R.string.roles_owner))
        compose.onNodeWithTag("${ProfileTags.TRAINS_HERE}.sarah-personal-training").assertDoesNotExist()
        compose.onNodeWithTag("${ProfileTags.TRAINS_HERE}.johns-gym").assertIsDisplayed()
    }

    // F005 AC4: back does nothing while a switch is being saved, so the person sees how it went.
    @Test
    fun test_F005_AC4_backDoesNothingWhileASwitchIsSaving() {
        openProfileAsSarah()
        val own = "${ProfileTags.TRAINS_HERE}.sarah-personal-training"
        val gate = CompletableDeferred<Unit>()
        trainers.gate = gate
        compose.onNodeWithTag(own).performClick()
        // The row is disabled once the screen shows that it is saving.
        compose.waitUntil(UI_TIMEOUT_MILLIS) {
            runCatching { compose.onNodeWithTag(own).assertIsNotEnabled() }.isSuccess
        }

        app.pressBack()

        compose.onNodeWithTag(own).assertIsDisplayed().assertIsNotEnabled()
        gate.complete(Unit)
        compose.waitUntilTagExists("${ProfileTags.TRAINS_HERE_SAVED}.sarah-personal-training")
        compose.onNodeWithTag(own).assertIsOn()
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}

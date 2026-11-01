package app.fivvi.pro.home

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import app.fivvi.api.models.MyWorkspace.Role
import app.fivvi.pro.AppLanguage
import app.fivvi.pro.AppRule
import app.fivvi.pro.R
import app.fivvi.pro.appLanguageParameters
import app.fivvi.pro.hello.FakeHelloApi
import app.fivvi.pro.localizedString
import app.fivvi.pro.waitUntilTagExists
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

    private fun launch() = app.launch(hello, device = listOf(language.tag), meApi = me, workspacesApi = workspaces)

    private fun string(id: Int) = localizedString(language, id)

    @Test
    fun test_F003_AC9_profileListsWorkspacesWithRole() {
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
        me.answerAccount()
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
        me.answerAccount()
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

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}

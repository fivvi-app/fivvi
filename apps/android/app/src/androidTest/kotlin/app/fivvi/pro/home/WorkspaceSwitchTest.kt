package app.fivvi.pro.home

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertHasNoClickAction
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import app.fivvi.api.models.MeWorkspace
import app.fivvi.api.models.MyWorkspace
import app.fivvi.api.models.MyWorkspace.Role
import app.fivvi.pro.AppLanguage
import app.fivvi.pro.AppRule
import app.fivvi.pro.R
import app.fivvi.pro.UI_TIMEOUT_MILLIS
import app.fivvi.pro.appLanguageParameters
import app.fivvi.pro.clients.ClientsTags
import app.fivvi.pro.clients.FakeClientsApi
import app.fivvi.pro.clients.clientIdOf
import app.fivvi.pro.clients.clientOf
import app.fivvi.pro.hello.FakeHelloApi
import app.fivvi.pro.localizedString
import app.fivvi.pro.waitUntilTagExists
import app.fivvi.pro.workspace.InMemoryLastWorkspaceStore
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

private const val JOHNS_GYM = "John's Gym"
private const val SARAH_PT = "Sarah Personal Training"

// F012 (spec #423): Sarah is Trainer of John's Gym and Owner of Sarah Personal Training (F003 seed). Profiel switches the
// workspace the app is in; the app reopens in the one used last; the first tab shows its name.
@RunWith(Parameterized::class)
class WorkspaceSwitchTest(@Suppress("UNUSED_PARAMETER") tag: String, private val language: AppLanguage) {
    @get:Rule
    val compose = createEmptyComposeRule()

    @get:Rule
    val app = AppRule()

    private val hello = FakeHelloApi().apply { answerGreeting() }
    private val me = FakeMeApi()
    private val clients = FakeClientsApi()
    private val lastWorkspace = InMemoryLastWorkspaceStore()

    private val johnsGym = Triple(JOHNS_GYM, "johns-gym", Role.TRAINER)
    private val sarahPersonalTraining = Triple(SARAH_PT, "sarah-personal-training", Role.OWNER)

    private fun string(id: Int, vararg args: Any) = localizedString(language, id, *args)

    private fun johnsRow() = compose.onNodeWithTag("${ProfileTags.WORKSPACE}.johns-gym")

    private fun sarahRow() = compose.onNodeWithTag("${ProfileTags.WORKSPACE}.sarah-personal-training")

    // The account is read by the home, again after a switch, and by each opening of Profiel (with the list of workspaces).
    private fun answerAccountAsSarah(
        times: Int,
        capabilitiesByWorkspace: Map<String, List<MeWorkspace.Capabilities>> = emptyMap(),
    ) = repeat(times) {
        me.answerAccount(
            name = "Sarah",
            email = "trainer@example.com",
            workspaces = listOf(JOHNS_GYM, SARAH_PT),
            capabilitiesByWorkspace = capabilitiesByWorkspace,
        )
    }

    private fun answerProfileAsSarah(times: Int) = repeat(times) {
        me.answerWorkspaces(johnsGym, sarahPersonalTraining)
    }

    private fun launch() = app.launch(
        hello,
        device = listOf(language.tag),
        meApi = me,
        clientsApi = clients,
        lastWorkspace = lastWorkspace,
    )

    private fun openProfile() {
        compose.waitUntilTagExists(HomeTags.OPEN_PROFILE)
        compose.onNodeWithTag(HomeTags.OPEN_PROFILE).performClick()
        compose.waitUntilTagExists("${ProfileTags.WORKSPACE}.sarah-personal-training")
    }

    private fun headerShows(name: String) {
        compose.waitUntil(UI_TIMEOUT_MILLIS) {
            runCatching { compose.onNodeWithTag(HomeTags.WORKSPACE_NAME).assertTextEquals(name) }.isSuccess
        }
    }

    @Test
    fun test_F012_AC6_profileSwitchesWorkspace() {
        answerAccountAsSarah(3)
        answerProfileAsSarah(1)
        clients.clientsOfWorkspace[workspaceIdOf(JOHNS_GYM)] = listOf(clientOf("Anna de Vries"))
        clients.clientsOfWorkspace[workspaceIdOf(SARAH_PT)] = listOf(clientOf("Eva Visser"))
        launch()
        headerShows(JOHNS_GYM)
        openProfile()
        johnsRow().assertIsSelected()
        sarahRow().assertIsNotSelected()

        sarahRow().performClick()

        // Back on the first tab, which names the new workspace; Klanten lists only its clients.
        headerShows(SARAH_PT)
        compose.onNodeWithTag(ProfileTags.TITLE).assertDoesNotExist()
        compose.waitUntilTagExists(HomeTags.OPEN_CLIENTS)
        compose.onNodeWithTag(HomeTags.OPEN_CLIENTS).performClick()
        compose.waitUntilTagExists("${ClientsTags.ROW}.${clientIdOf("Eva Visser")}")
        compose.onNodeWithTag("${ClientsTags.ROW}.${clientIdOf("Anna de Vries")}").assertDoesNotExist()
        assertEquals(workspaceIdOf(SARAH_PT), clients.listed.last())
    }

    @Test
    fun test_F012_AC6_theCheckMovesToTheNewWorkspace() {
        answerAccountAsSarah(4)
        answerProfileAsSarah(2)
        launch()
        headerShows(JOHNS_GYM)
        openProfile()
        sarahRow().performClick()
        headerShows(SARAH_PT)

        openProfile()

        sarahRow().assertIsSelected()
        johnsRow().assertIsNotSelected()
    }

    @Test
    fun test_F012_AC6_tappingTheCurrentWorkspaceOnlyReturnsToTheFirstTab() {
        answerAccountAsSarah(2)
        answerProfileAsSarah(1)
        launch()
        headerShows(JOHNS_GYM)
        openProfile()

        johnsRow().performClick()

        headerShows(JOHNS_GYM)
        compose.onNodeWithTag(ProfileTags.TITLE).assertDoesNotExist()
        assertNull(lastWorkspace.id)
        // The home's read and Profiel's own: a tap on the current workspace reads nothing more.
        assertEquals(2, me.calls)
    }

    @Test
    fun test_F012_AC6_oneWorkspaceHasNoCheckAndNoAction() {
        me.answerAccount(workspaces = listOf(SARAH_PT))
        me.answerAccount(workspaces = listOf(SARAH_PT))
        me.answerWorkspaces(sarahPersonalTraining)
        launch()
        compose.waitUntilTagExists(HomeTags.OPEN_PROFILE)
        compose.onNodeWithTag(HomeTags.OPEN_PROFILE).performClick()
        compose.waitUntilTagExists("${ProfileTags.WORKSPACE}.sarah-personal-training")

        sarahRow().assertHasNoClickAction()
        sarahRow().assert(SemanticsMatcher.keyNotDefined(SemanticsProperties.Selected))
    }

    @Test
    fun test_F012_AC7_theAppReopensInTheLastWorkspace() {
        answerAccountAsSarah(4)
        answerProfileAsSarah(1)
        launch()
        headerShows(JOHNS_GYM)
        openProfile()
        sarahRow().performClick()
        headerShows(SARAH_PT)

        app.close()
        hello.answerGreeting()
        launch()

        headerShows(SARAH_PT)
    }

    @Test
    fun test_F012_AC5_aRememberedWorkspaceTheTeamLostFallsBackWithoutAnError() {
        lastWorkspace.id = workspaceIdOf("Gone Gym")
        answerAccountAsSarah(1)

        launch()

        headerShows(JOHNS_GYM)
        compose.onNodeWithTag(HomeTags.ERROR).assertDoesNotExist()
    }

    @Test
    fun test_F012_AC5_withNoWorkspaceLeftTheNoAccessStateShows() {
        lastWorkspace.id = workspaceIdOf(SARAH_PT)
        me.answerAccount(workspaces = emptyList())

        launch()

        compose.waitUntilTagExists(HomeTags.NO_ACCESS)
    }

    @Test
    fun test_F012_AC10_switchingKeepsTheInterfaceLanguage() {
        answerAccountAsSarah(3)
        answerProfileAsSarah(1)
        launch()
        headerShows(JOHNS_GYM)
        openProfile()

        sarahRow().performClick()

        headerShows(SARAH_PT)
        compose.waitUntilTagExists(HomeTags.SIGN_OUT)
        compose.onNodeWithTag(HomeTags.SIGN_OUT).assertTextEquals(string(R.string.sign_out_label))
        compose.onNodeWithTag(HomeTags.OPEN_PROFILE).assertTextEquals(string(R.string.my_profile_title))
        assertEquals(emptyList<Any>(), me.updates)
    }

    // AC11: the actions follow what the API lists for the workspace the app is in. Sarah is a Trainer in John's Gym, with
    // no right to add clients there.
    @Test
    fun test_F012_AC11_actionsFollowTheWorkspaceRole() {
        answerAccountAsSarah(
            3,
            capabilitiesByWorkspace = mapOf(JOHNS_GYM to listOf(MeWorkspace.Capabilities.CLIENTS_PERIOD_VIEW)),
        )
        answerProfileAsSarah(1)
        launch()
        headerShows(JOHNS_GYM)
        compose.waitUntilTagExists(HomeTags.OPEN_CLIENTS)
        compose.onNodeWithTag(HomeTags.OPEN_CLIENTS).performClick()
        compose.waitUntilTagExists(ClientsTags.LIST)
        compose.onNodeWithTag(ClientsTags.ADD).assertDoesNotExist()
        app.pressBack()
        openProfile()

        sarahRow().performClick()

        headerShows(SARAH_PT)
        compose.waitUntilTagExists(HomeTags.OPEN_CLIENTS)
        compose.onNodeWithTag(HomeTags.OPEN_CLIENTS).performClick()
        compose.waitUntilTagExists(ClientsTags.ADD)
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}

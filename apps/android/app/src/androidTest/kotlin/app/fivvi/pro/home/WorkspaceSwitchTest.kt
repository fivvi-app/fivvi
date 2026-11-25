package app.fivvi.pro.home

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertContentDescriptionEquals
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
import app.fivvi.api.models.TrainerWord
import app.fivvi.core.AppLanguage
import app.fivvi.core.R
import app.fivvi.core.appLanguageParameters
import app.fivvi.core.me.FakeMeApi
import app.fivvi.core.me.workspaceIdOf
import app.fivvi.core.quarantine.Permission
import app.fivvi.pro.AppRule
import app.fivvi.pro.UI_TIMEOUT_MILLIS
import app.fivvi.pro.clients.ClientsTags
import app.fivvi.pro.clients.FakeClientsApi
import app.fivvi.pro.clients.clientIdOf
import app.fivvi.pro.clients.clientOf
import app.fivvi.pro.localizedString
import app.fivvi.pro.waitUntilTagExists
import app.fivvi.pro.workspace.InMemoryLastWorkspaceStore
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

private const val JOHNS_GYM = "John's Gym"
private const val SARAH_PT = "Sarah Personal Training"
private const val YOGA_LOFT = "Yoga Loft"

// F012 (spec #423): Sarah is Trainer of John's Gym and Owner of Sarah Personal Training (F003 seed). Profiel switches the
// workspace the app is in; the app reopens in the one used last; the first tab shows its name.
@RunWith(Parameterized::class)
class WorkspaceSwitchTest(@Suppress("UNUSED_PARAMETER") tag: String, private val language: AppLanguage) {
    @get:Rule
    val compose = createEmptyComposeRule()

    @get:Rule
    val app = AppRule()

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
        device = listOf(language.tag),
        meApi = me,
        clientsApi = clients,
        lastWorkspace = lastWorkspace,
    )

    private fun openProfile(lastSlug: String = "sarah-personal-training") {
        compose.waitUntilTagExists(HomeTags.OPEN_PROFILE)
        compose.onNodeWithTag(HomeTags.OPEN_PROFILE).performClick()
        compose.waitUntilTagExists("${ProfileTags.WORKSPACE}.$lastSlug")
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
        assertEquals(workspaceIdOf(JOHNS_GYM), lastWorkspace.id)
        // The home's read and Profiel's own: a tap on the current workspace reads nothing more.
        assertEquals(2, me.calls)
    }

    // TalkBack reads the row as the name and the role of the workspace, as the merged row of a button would.
    @Test
    fun test_F012_AC6_theRowReadsTheNameAndTheRoleToTalkBack() {
        answerAccountAsSarah(2)
        answerProfileAsSarah(1)
        launch()
        headerShows(JOHNS_GYM)
        openProfile()

        sarahRow().assertContentDescriptionEquals("$SARAH_PT, ${string(R.string.roles_owner)}")
        johnsRow().assertContentDescriptionEquals("$JOHNS_GYM, ${string(R.string.trainer_word_trainer_word_cap)}")
    }

    // F068 AC4: Sarah is a Trainer in John's Gym (*instructeur*) and in Yoga Loft (*docent*): each row names its own word,
    // also right after she switches to the other workspace, and back; her role is Trainer in both, so the same actions.
    @Test
    fun test_F068_AC4_eachWorkspaceShowsItsOwnWordAlsoRightAfterSwitching() {
        val words = mapOf(JOHNS_GYM to TrainerWord.INSTRUCTEUR, YOGA_LOFT to TrainerWord.DOCENT)
        val yogaLoft = Triple(YOGA_LOFT, "yoga-loft", Role.TRAINER)
        repeat(6) {
            me.answerAccount(
                name = "Sarah",
                email = "trainer@example.com",
                workspaces = listOf(JOHNS_GYM, YOGA_LOFT),
                role = MeWorkspace.Role.TRAINER,
                trainerWords = words,
            )
        }
        repeat(3) { me.answerWorkspaces(emptySet(), johnsGym, yogaLoft, trainerWords = words) }
        launch()
        headerShows(JOHNS_GYM)
        openProfile("yoga-loft")
        val johnsRole = compose.onNodeWithTag("${ProfileTags.WORKSPACE_ROLE}.johns-gym")
        val yogaRole = compose.onNodeWithTag("${ProfileTags.WORKSPACE_ROLE}.yoga-loft")
        johnsRole.assertTextEquals(string(R.string.trainer_word_instructeur_word_cap))
        yogaRole.assertTextEquals(string(R.string.trainer_word_docent_word_cap))

        // Choosing a workspace closes Profiel on that workspace's home: open it again.
        compose.onNodeWithTag("${ProfileTags.WORKSPACE}.yoga-loft").performClick()
        headerShows(YOGA_LOFT)
        openProfile("yoga-loft")
        johnsRole.assertTextEquals(string(R.string.trainer_word_instructeur_word_cap))
        yogaRole.assertTextEquals(string(R.string.trainer_word_docent_word_cap))

        // And back: John's Gym again, each row still with its own word.
        compose.onNodeWithTag("${ProfileTags.WORKSPACE}.johns-gym").performClick()
        headerShows(JOHNS_GYM)
        openProfile("yoga-loft")
        johnsRole.assertTextEquals(string(R.string.trainer_word_instructeur_word_cap))
        yogaRole.assertTextEquals(string(R.string.trainer_word_docent_word_cap))
        johnsRole.assertTextEquals(if (language == AppLanguage.DUTCH) "Instructeur" else "Instructor")
        yogaRole.assertTextEquals(if (language == AppLanguage.DUTCH) "Docent" else "Teacher")
        compose.onNodeWithTag("${ProfileTags.TRAINS_HERE}.johns-gym").assertDoesNotExist()
        compose.onNodeWithTag("${ProfileTags.TRAINS_HERE}.yoga-loft").assertDoesNotExist()
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
    fun test_F012_AC7_appOpensLastWorkspace() {
        answerAccountAsSarah(4)
        answerProfileAsSarah(1)
        launch()
        headerShows(JOHNS_GYM)
        openProfile()
        sarahRow().performClick()
        headerShows(SARAH_PT)

        app.close()
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
        compose.onNodeWithTag(HomeTags.OPEN_PROFILE).assertTextEquals(string(R.string.profile_title))
        assertEquals(emptyList<Any>(), me.updates)
    }

    // AC11: the actions follow what the API lists for the workspace the app is in. Sarah is a Trainer in John's Gym, with
    // no right to add clients there.
    @Test
    @Permission
    fun test_F012_AC11_actionsFollowWorkspaceRole() {
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

package app.fivvi.pro.clients

import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextReplacement
import androidx.lifecycle.viewmodel.compose.viewModel
import app.fivvi.api.models.Locale
import app.fivvi.api.models.MeWorkspace
import app.fivvi.api.models.TrainerWord
import app.fivvi.core.AppLanguage
import app.fivvi.core.R
import app.fivvi.core.appLanguageParameters
import app.fivvi.core.me.FakeMeApi
import app.fivvi.core.me.workspaceIdOf
import app.fivvi.core.quarantine.Isolation
import app.fivvi.core.quarantine.Permission
import app.fivvi.pro.capabilities.WorkspaceCapabilities
import app.fivvi.pro.home.FakeWorkspacesApi
import app.fivvi.pro.localizedString
import app.fivvi.pro.showAtLargestFontScale
import app.fivvi.pro.waitUntilTagExists
import java.io.IOException
import java.util.UUID
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// What the flow does with the workspace and the profile's loading state (F006 AC12), without the rest of the app.
@RunWith(Parameterized::class)
class ClientsFlowTest(@Suppress("UNUSED_PARAMETER") tag: String, private val language: AppLanguage) {
    @get:Rule
    val compose = createComposeRule()

    private val clients = FakeClientsApi()
    private val gym = workspaceIdOf("John's Gym")
    private val studio = workspaceIdOf("Studio Noord")

    // F003 AC6: the home shows another workspace after the foreground read; Klanten lists that one, not the first.
    @Test
    @Isolation
    fun test_F006_AC12_aWorkspaceSwitchListsTheNewWorkspacesClients() {
        clients.clients += clientOf("Anna de Vries", "anna@example.com")
        val shown = mutableStateOf(gym)
        compose.showAtLargestFontScale(language) {
            val capabilities = viewModel(key = "capabilities") { WorkspaceCapabilities(FakeMeApi()) }
            ClientsFlow(
                clients,
                FakeWorkspacesApi(),
                capabilities,
                shown.value,
                "Workspace",
                sessionKey = "token-1",
                onClose = {},
            )
        }
        compose.waitUntilTagExists(ClientsTags.LIST)
        assertEquals(gym, clients.listed.last())

        shown.value = studio

        compose.waitUntil(UI_WAIT) { clients.listed.last() == studio }
        compose.waitUntilTagExists(ClientsTags.LIST)
    }

    // information-architecture.md §9.5: skeleton rows in the layout's shape while loading, a line after 10 s.
    @Test
    fun test_F006_AC12_theProfileLoadsAsASkeletonWithTheSlowLineAfterTenSeconds() {
        compose.mainClock.autoAdvance = false
        compose.showAtLargestFontScale(language) {
            ClientProfileScreen(
                ClientProfileState.Loading,
                Locale.NL_NL,
                "Workspace",
                null,
                ClientProfileActions({}, {}, null, {}, {}, {}, {}, ClientFormActions({}, {}, {}, {}, {}, {})),
            )
        }
        compose.mainClock.advanceTimeBy(1_000)
        compose.onNodeWithTag(ClientProfileTags.LOADING).assertIsDisplayed()
        compose.onNodeWithTag(ClientProfileTags.LOADING_SLOW).assertDoesNotExist()

        compose.mainClock.advanceTimeBy(10_000)

        compose.onNodeWithTag(ClientProfileTags.LOADING_SLOW)
            .assertTextEquals(localizedString(language, R.string.common_loading_slow))
    }

    // A 403 on the save is about clients.manage: Bewerken goes and stays hidden even when the account read fails, and
    // clients.view stays listed (WorkspaceCapabilities: "a read that fails leaves the action hidden").
    @Test
    @Permission
    fun test_F006_AC12_aRefusedSaveHidesOnlyManageAndKeepsViewWhenTheAccountReadFails() {
        val anna = clientOf("Anna de Vries", "anna@example.com")
        clients.clients += anna
        clients.updateAnswers += { _, _ -> clients.status(403) }
        lateinit var capabilities: WorkspaceCapabilities
        compose.showAtLargestFontScale(language) {
            capabilities = viewModel(key = "capabilities") {
                WorkspaceCapabilities(FakeMeApi().apply { answers += { throw IOException("offline") } })
            }
            ClientsFlow(
                clients,
                FakeWorkspacesApi(),
                capabilities,
                gym,
                "Workspace",
                sessionKey = "token-1",
                onClose = {},
            )
        }
        compose.runOnIdle {
            capabilities.replace(
                listOf(
                    MeWorkspace(
                        gym,
                        "John's Gym",
                        "slug",
                        TrainerWord.TRAINER,
                        MeWorkspace.Role.OWNER,
                        listOf(
                            MeWorkspace.Capabilities.CLIENTS_PERIOD_VIEW,
                            MeWorkspace.Capabilities.CLIENTS_PERIOD_MANAGE,
                        ),
                    ),
                ),
            )
        }
        compose.waitUntilTagExists("${ClientsTags.ROW}.${anna.id}")
        compose.onNodeWithTag("${ClientsTags.ROW}.${anna.id}").performClick()
        compose.waitUntilTagExists(ClientProfileTags.EDIT)
        compose.onNodeWithTag(ClientProfileTags.EDIT).performClick()
        compose.waitUntilTagExists("${ClientProfileTags.EDIT_PREFIX}.name")
        compose.onNodeWithTag("${ClientProfileTags.EDIT_PREFIX}.name").performTextReplacement("Anna Visser")

        compose.onNodeWithTag(ClientProfileTags.EDIT_SAVE).performClick()

        compose.waitUntilTagExists(ClientProfileTags.NAME)
        compose.onNodeWithTag(ClientProfileTags.EDIT).assertDoesNotExist()
        compose.runOnIdle {
            assertTrue(capabilities.mayShow(gym, MeWorkspace.Capabilities.CLIENTS_PERIOD_VIEW))
            assertFalse(capabilities.mayShow(gym, MeWorkspace.Capabilities.CLIENTS_PERIOD_MANAGE))
        }
    }

    // F003 AC6: the home shows another workspace while a profile is open; that client is not in the new workspace, so
    // the flow is back at the list of the new workspace.
    @Test
    fun test_F006_AC12_aWorkspaceSwitchWhileAProfileIsOpenGoesBackToTheList() {
        val anna = clientOf("Anna de Vries", "anna@example.com")
        clients.clients += anna
        val shown = mutableStateOf(gym)
        compose.showAtLargestFontScale(language) {
            val capabilities = viewModel(key = "capabilities") { WorkspaceCapabilities(FakeMeApi()) }
            ClientsFlow(
                clients,
                FakeWorkspacesApi(),
                capabilities,
                shown.value,
                "Workspace",
                sessionKey = "token-1",
                onClose = {},
            )
        }
        compose.waitUntilTagExists("${ClientsTags.ROW}.${anna.id}")
        compose.onNodeWithTag("${ClientsTags.ROW}.${anna.id}").performClick()
        compose.waitUntilTagExists(ClientProfileTags.NAME)

        shown.value = studio

        compose.waitUntilTagExists(ClientsTags.LIST)
        compose.onNodeWithTag(ClientProfileTags.NAME).assertDoesNotExist()
        assertEquals(studio, clients.listed.last())
    }

    // The view model of a form is never reused by a later opening: after a client was added, a workspace switch and back
    // (F003 AC6), or closing and reopening Klanten, *+ Nieuwe klant* shows an empty form, not the earlier client's profile.
    @Test
    fun test_F006_AC12_newClientIsAnEmptyFormAfterAWorkspaceSwitchAndBack() {
        val shown = mutableStateOf(gym)
        showFlow(shown = shown)
        addCarla()

        shown.value = studio
        compose.waitUntil(UI_WAIT) { clients.listed.last() == studio }
        shown.value = gym
        compose.waitForIdle()
        compose.waitUntilTagExists(ClientsTags.LIST)

        assertNewClientFormIsEmpty()
    }

    @Test
    fun test_F006_AC12_newClientIsAnEmptyFormAfterClosingAndReopeningKlanten() {
        val open = mutableStateOf(true)
        showFlow(open = open)
        addCarla()

        open.value = false
        compose.waitUntil(UI_WAIT) { compose.onAllNodesWithTag(ClientProfileTags.NAME).fetchSemanticsNodes().isEmpty() }
        open.value = true
        compose.waitUntilTagExists(ClientsTags.LIST)

        assertNewClientFormIsEmpty()
    }

    // A profile opened again after the same client was open before is read again (AC7), not served from the old model.
    @Test
    fun test_F006_AC12_aProfileOpenedAgainAfterReopeningKlantenIsReadAgain() {
        val anna = clientOf("Anna de Vries", "anna@example.com")
        clients.clients += anna
        val open = mutableStateOf(true)
        showFlow(open = open)
        compose.waitUntilTagExists("${ClientsTags.ROW}.${anna.id}")
        compose.onNodeWithTag("${ClientsTags.ROW}.${anna.id}").performClick()
        compose.waitUntilTagExists(ClientProfileTags.NAME)
        val reads = clients.read.count { it == anna.id }

        open.value = false
        compose.waitUntil(UI_WAIT) { compose.onAllNodesWithTag(ClientProfileTags.NAME).fetchSemanticsNodes().isEmpty() }
        open.value = true
        compose.waitUntilTagExists("${ClientsTags.ROW}.${anna.id}")
        compose.onNodeWithTag("${ClientsTags.ROW}.${anna.id}").performClick()

        compose.waitUntil(UI_WAIT) { clients.read.count { it == anna.id } > reads }
    }

    private fun showFlow(
        shown: MutableState<UUID> = mutableStateOf(gym),
        open: MutableState<Boolean> = mutableStateOf(true),
    ) {
        compose.showAtLargestFontScale(language) {
            val capabilities = viewModel(key = "capabilities") { WorkspaceCapabilities(FakeMeApi()) }
            if (open.value) {
                ClientsFlow(
                    clients,
                    FakeWorkspacesApi(),
                    capabilities,
                    shown.value,
                    "Workspace",
                    sessionKey = "token-1",
                    onClose = {},
                )
            }
            LaunchedEffect(Unit) {
                capabilities.replace(
                    listOf(gym, studio).map {
                        MeWorkspace(
                            it,
                            "Workspace",
                            "slug",
                            TrainerWord.TRAINER,
                            MeWorkspace.Role.OWNER,
                            listOf(
                                MeWorkspace.Capabilities.CLIENTS_PERIOD_VIEW,
                                MeWorkspace.Capabilities.CLIENTS_PERIOD_MANAGE,
                            ),
                        )
                    },
                )
            }
        }
    }

    private fun addCarla() {
        compose.waitUntilTagExists(ClientsTags.ADD)
        compose.onNodeWithTag(ClientsTags.ADD).performClick()
        compose.waitUntilTagExists("${AddClientTags.PREFIX}.name")
        compose.onNodeWithTag("${AddClientTags.PREFIX}.name").performTextReplacement("Carla Bos")
        compose.onNodeWithTag("${AddClientTags.PREFIX}.email").performTextReplacement("carla@example.com")
        compose.onNodeWithTag(AddClientTags.SUBMIT).performClick()
        compose.waitUntilTagExists(ClientProfileTags.NAME)
    }

    private fun assertNewClientFormIsEmpty() {
        compose.waitUntilTagExists(ClientsTags.ADD)
        compose.onNodeWithTag(ClientsTags.ADD).performClick()
        compose.waitUntilTagExists("${AddClientTags.PREFIX}.name")
        compose.onNodeWithTag(ClientProfileTags.NAME).assertDoesNotExist()
        val typed = compose.onNodeWithTag("${AddClientTags.PREFIX}.name").fetchSemanticsNode()
            .config[SemanticsProperties.EditableText].text
        assertEquals("", typed)
    }

    companion object {
        private const val UI_WAIT = 5_000L

        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}

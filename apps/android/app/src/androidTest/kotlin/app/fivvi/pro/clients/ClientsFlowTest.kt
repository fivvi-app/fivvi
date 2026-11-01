package app.fivvi.pro.clients

import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextReplacement
import androidx.lifecycle.viewmodel.compose.viewModel
import app.fivvi.api.models.Locale
import app.fivvi.api.models.MeWorkspace
import app.fivvi.pro.AppLanguage
import app.fivvi.pro.R
import app.fivvi.pro.appLanguageParameters
import app.fivvi.pro.capabilities.WorkspaceCapabilities
import app.fivvi.pro.home.FakeMeApi
import app.fivvi.pro.home.FakeWorkspacesApi
import app.fivvi.pro.home.workspaceIdOf
import app.fivvi.pro.localizedString
import app.fivvi.pro.showAtLargestFontScale
import app.fivvi.pro.waitUntilTagExists
import java.io.IOException
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

    companion object {
        private const val UI_WAIT = 5_000L

        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}

package app.fivvi.pro.clients

import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.lifecycle.viewmodel.compose.viewModel
import app.fivvi.api.models.Locale
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
import org.junit.Assert.assertEquals
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

    companion object {
        private const val UI_WAIT = 5_000L

        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}

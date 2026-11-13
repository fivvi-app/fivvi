package app.fivvi.pro.clients

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.ComposeTestRule
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import app.fivvi.api.models.Client
import app.fivvi.api.models.Locale
import app.fivvi.api.models.MeWorkspace
import app.fivvi.api.models.TrainerWord
import app.fivvi.api.models.Workspace
import app.fivvi.core.AppLanguage
import app.fivvi.core.R
import app.fivvi.core.appLanguageParameters
import app.fivvi.core.me.FakeMeApi
import app.fivvi.core.quarantine.Permission
import app.fivvi.pro.AppRule
import app.fivvi.pro.UI_TIMEOUT_MILLIS
import app.fivvi.pro.hello.FakeHelloApi
import app.fivvi.pro.home.FakeWorkspacesApi
import app.fivvi.pro.home.HomeTags
import app.fivvi.pro.localizedString
import app.fivvi.pro.waitUntilTagExists
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized
import retrofit2.Response

// TM-02, TM-03 and *+ Nieuwe klant* (F006 AC12, M4), through the app with a fake API, in both languages: John's Gym with
// Anna de Vries and Mark Jansen. The wording is the catalog's (packages/i18n), read in the language under test.
@RunWith(Parameterized::class)
class ClientsScreenTest(@Suppress("UNUSED_PARAMETER") tag: String, private val language: AppLanguage) {
    @get:Rule
    val compose = createEmptyComposeRule()

    @get:Rule
    val app = AppRule()

    private val hello = FakeHelloApi().apply { answerGreeting() }
    private val me = FakeMeApi()
    private val clients = FakeClientsApi()
    private val workspaces = FakeWorkspacesApi()
    private val anna = clientOf("Anna de Vries", "anna@example.com", Client.EmailLocale.EN)
    private val mark = clientOf("Mark Jansen", "mark.jansen@example.com")

    private fun launch(vararg capabilities: MeWorkspace.Capabilities) {
        me.answerAccount(capabilities = capabilities.toList().ifEmpty { MeWorkspace.Capabilities.values().toList() })
        clients.clients += listOf(anna, mark)
        app.launch(hello, device = listOf(language.tag), meApi = me, workspacesApi = workspaces, clientsApi = clients)
        compose.waitUntilTagExists(HomeTags.OPEN_CLIENTS)
    }

    private fun string(id: Int, vararg args: Any) = localizedString(language, id, *args)

    private fun openClients() {
        compose.onNodeWithTag(HomeTags.OPEN_CLIENTS).performClick()
        compose.waitUntilTagExists(ClientsTags.LIST)
    }

    private fun type(tag: String, text: String) = compose.onNodeWithTag(tag).performTextInput(text)

    @Test
    fun test_F006_AC12_listShowsTheClientsOfTheWorkspaceWithTheirAddress() {
        launch()

        openClients()

        compose.onNodeWithTag(ClientsTags.TITLE).assertTextEquals(string(R.string.clients_title))
        compose.onNodeWithTag(
            "${ClientsTags.ROW_NAME}.${anna.id}",
            useUnmergedTree = true,
        ).assertTextEquals("Anna de Vries")
        compose.onNodeWithTag(
            "${ClientsTags.ROW_EMAIL}.${anna.id}",
            useUnmergedTree = true,
        ).assertTextEquals("anna@example.com")
        compose.onNodeWithTag(
            "${ClientsTags.ROW_NAME}.${mark.id}",
            useUnmergedTree = true,
        ).assertTextEquals("Mark Jansen")
        compose.onNodeWithTag(
            "${ClientsTags.ROW_EMAIL}.${mark.id}",
            useUnmergedTree = true,
        ).assertTextEquals("mark.jansen@example.com")
        compose.onNodeWithText(string(R.string.clients_search_placeholder)).assertIsDisplayed()
    }

    @Test
    fun test_F006_AC6_searchFindsPartOfAName() {
        launch()
        openClients()

        type(ClientsTags.SEARCH, "vrie")

        compose.waitUntil(5_000) {
            compose.onAllNodes(hasTestTag("${ClientsTags.ROW_NAME}.${mark.id}"), useUnmergedTree = true)
                .fetchSemanticsNodes().isEmpty()
        }
        compose.onNodeWithTag("${ClientsTags.ROW_NAME}.${anna.id}", useUnmergedTree = true).assertIsDisplayed()
    }

    @Test
    fun test_F006_AC6_aSearchWithoutResultsSaysSo() {
        launch()
        openClients()

        type(ClientsTags.SEARCH, "zzz")

        compose.waitUntilTagExists(ClientsTags.NO_RESULTS)
        compose.onNodeWithTag(ClientsTags.NO_RESULTS).assertTextEquals(string(R.string.clients_no_results))
    }

    @Test
    fun test_F006_AC12_noClientsYetSaysSoAndOffersTheAction() {
        me.answerAccount()
        app.launch(hello, device = listOf(language.tag), meApi = me, workspacesApi = workspaces, clientsApi = clients)
        compose.waitUntilTagExists(HomeTags.OPEN_CLIENTS)

        openClients()

        compose.onNodeWithTag(ClientsTags.EMPTY).assertTextEquals(string(R.string.clients_empty))
        compose.onNodeWithTag(ClientsTags.ADD).assertIsDisplayed()
    }

    // AC1: a name and an email address; the profile opens with a confirmation, and the language is the workspace's default, named.
    @Test
    fun test_F006_AC1_newClientWithANameAndAnEmailOpensTheProfile() {
        launch()
        openClients()

        compose.onNodeWithText(string(R.string.clients_new_client), useUnmergedTree = true).assertIsDisplayed()
        compose.onNodeWithTag(ClientsTags.ADD).performClick()
        compose.waitUntilTagExists("${AddClientTags.PREFIX}.name")
        compose.onNodeWithTag("${AddClientTags.PREFIX}.language.default")
            .assertTextContains(
                string(R.string.clients_add_dialog_locale_default, string(R.string.clients_language_names_nl)),
            )
        compose.onNodeWithTag("${AddClientTags.PREFIX}.language.default").assertIsSelected()
        type("${AddClientTags.PREFIX}.name", "Carla Bos")
        type("${AddClientTags.PREFIX}.email", "carla@example.com")
        compose.onNodeWithTag(AddClientTags.SUBMIT).performClick()

        compose.waitUntilTagExists(ClientProfileTags.TITLE)
        compose.onNodeWithTag(ClientProfileTags.TITLE).assertTextEquals("Carla Bos")
        compose.onNodeWithTag(ClientProfileTags.NAME).assertTextEquals("Carla Bos")
        compose.onNodeWithTag(ClientProfileTags.EMAIL).assertTextEquals("carla@example.com")
        compose.onNodeWithTag(ClientProfileTags.LANGUAGE).assertTextEquals(
            string(R.string.clients_add_dialog_locale_default, string(R.string.clients_language_names_nl)),
        )
        compose.waitUntilTagExists(ClientProfileTags.SNACKBAR)
        compose.onNodeWithText(string(R.string.clients_profile_added, "Carla Bos")).assertIsDisplayed()
    }

    @Test
    fun test_F006_AC1_theDefaultLanguageNamesTheWorkspacesDefault() {
        workspaces.answers += {
            Response.success(
                Workspace(it, "John's Gym", "johns-gym", Locale.EN, "Europe/Amsterdam", TrainerWord.TRAINER),
            )
        }
        launch()
        openClients()

        compose.onNodeWithTag(ClientsTags.ADD).performClick()

        compose.waitUntilTagExists("${AddClientTags.PREFIX}.language.default")
        compose.onNodeWithTag("${AddClientTags.PREFIX}.language.default")
            .assertTextContains(
                string(R.string.clients_add_dialog_locale_default, string(R.string.clients_language_names_en)),
            )
    }

    @Test
    fun test_F006_AC2_aTooLongNameIsRefusedWithAFieldMessageAndTheInputStays() {
        launch()
        openClients()
        clients.addAnswers += { clients.refused("name" to "too_big") }
        compose.onNodeWithTag(ClientsTags.ADD).performClick()
        compose.waitUntilTagExists("${AddClientTags.PREFIX}.name")
        type("${AddClientTags.PREFIX}.name", "x".repeat(121))

        compose.onNodeWithTag(AddClientTags.SUBMIT).performClick()

        compose.waitUntilUnmergedTagExists("${AddClientTags.PREFIX}.nameError")
        compose.onNodeWithTag("${AddClientTags.PREFIX}.nameError", useUnmergedTree = true)
            .assertTextEquals(string(R.string.clients_add_dialog_errors_name_too_long))
        compose.onNodeWithTag("${AddClientTags.PREFIX}.name").assertTextContains("x".repeat(121))
    }

    // AC1, AC2: the address is required. Left empty, the API refuses the add (400 on `email`), the form says so under the
    // field, keeps the name, and no client is added.
    @Test
    fun test_F006_AC2_aMissingAddressIsRefusedWithAFieldMessageAndNothingIsAdded() {
        launch()
        openClients()
        val before = clients.clients.size
        compose.onNodeWithTag(ClientsTags.ADD).performClick()
        compose.waitUntilTagExists("${AddClientTags.PREFIX}.name")
        type("${AddClientTags.PREFIX}.name", "Carla Bos")

        compose.onNodeWithTag(AddClientTags.SUBMIT).performClick()

        compose.waitUntilUnmergedTagExists("${AddClientTags.PREFIX}.emailError")
        compose.onNodeWithTag("${AddClientTags.PREFIX}.emailError", useUnmergedTree = true)
            .assertTextEquals(string(R.string.clients_add_dialog_errors_email_invalid))
        compose.onNodeWithTag("${AddClientTags.PREFIX}.name").assertTextContains("Carla Bos")
        compose.onNodeWithTag(ClientProfileTags.TITLE).assertDoesNotExist()
        assertEquals(before, clients.clients.size)
    }

    @Test
    fun test_F006_AC2_anInvalidAddressIsRefusedWithAFieldMessage() {
        launch()
        openClients()
        clients.addAnswers += { clients.refused("email" to "invalid_format") }
        compose.onNodeWithTag(ClientsTags.ADD).performClick()
        compose.waitUntilTagExists("${AddClientTags.PREFIX}.name")
        type("${AddClientTags.PREFIX}.name", "Carla Bos")
        type("${AddClientTags.PREFIX}.email", "carla")

        compose.onNodeWithTag(AddClientTags.SUBMIT).performClick()

        compose.waitUntilUnmergedTagExists("${AddClientTags.PREFIX}.emailError")
        compose.onNodeWithTag("${AddClientTags.PREFIX}.emailError", useUnmergedTree = true)
            .assertTextEquals(string(R.string.clients_add_dialog_errors_email_invalid))
    }

    // AC3: the form offers Anna instead of a second client; opening her shows her profile.
    @Test
    fun test_F006_AC3_theSameAddressOffersToOpenTheExistingClient() {
        launch()
        openClients()
        clients.addAnswers += { clients.exists(anna.id) }
        compose.onNodeWithTag(ClientsTags.ADD).performClick()
        compose.waitUntilTagExists("${AddClientTags.PREFIX}.name")
        type("${AddClientTags.PREFIX}.name", "Anna")
        type("${AddClientTags.PREFIX}.email", "ANNA@example.com")
        compose.onNodeWithTag(AddClientTags.SUBMIT).performClick()

        compose.waitUntilTagExists("${AddClientTags.PREFIX}.duplicate")
        compose.onNodeWithText(string(R.string.clients_add_dialog_exists, "Anna de Vries")).assertIsDisplayed()
        compose.onNodeWithTag("${AddClientTags.PREFIX}.otherEmail")
            .assertTextEquals(string(R.string.clients_add_dialog_other_email))
        compose.onNodeWithTag("${AddClientTags.PREFIX}.openExisting")
            .assertTextEquals(string(R.string.clients_add_dialog_open_existing, "Anna de Vries"))
        compose.onNodeWithTag("${AddClientTags.PREFIX}.openExisting").performClick()

        compose.waitUntilTagExists(ClientProfileTags.TITLE)
        compose.onNodeWithTag(ClientProfileTags.TITLE).assertTextEquals("Anna de Vries")
        compose.onNodeWithTag(ClientProfileTags.EMAIL).assertTextEquals("anna@example.com")
        compose.onNodeWithTag(
            ClientProfileTags.LANGUAGE,
        ).assertTextEquals(string(R.string.clients_add_dialog_locale_en))
    }

    @Test
    fun test_F006_AC12_aFailedAddKeepsTheInputAndSaysNotSaved() {
        launch()
        openClients()
        clients.failure = java.io.IOException("offline")
        compose.onNodeWithTag(ClientsTags.ADD).performClick()
        compose.waitUntilTagExists("${AddClientTags.PREFIX}.name")
        type("${AddClientTags.PREFIX}.name", "Carla Bos")

        compose.onNodeWithTag(AddClientTags.SUBMIT).performClick()

        compose.waitUntilTagExists("${AddClientTags.PREFIX}.failed")
        compose.onNodeWithTag("${AddClientTags.PREFIX}.failed")
            .assertTextEquals(string(R.string.clients_add_dialog_errors_not_saved))
        compose.onNodeWithTag("${AddClientTags.PREFIX}.name").assertTextContains("Carla Bos")
    }

    // F004 AC10 / F006: *+ Nieuwe klant* and *Bewerken* show only with `clients.manage`, from the helper alone.
    @Test
    fun test_F006_AC12_newClientAndEditAreHiddenWithoutClientsManage() {
        launch(MeWorkspace.Capabilities.CLIENTS_PERIOD_VIEW)
        openClients()

        compose.onNodeWithTag(ClientsTags.ADD).assertDoesNotExist()
        compose.onNodeWithTag("${ClientsTags.ROW}.${anna.id}").performClick()

        compose.waitUntilTagExists(ClientProfileTags.TITLE)
        compose.onNodeWithTag(ClientProfileTags.EDIT).assertDoesNotExist()
    }

    @Test
    fun test_F006_AC12_klantenIsHiddenWithoutClientsView() {
        me.answerAccount(capabilities = listOf(MeWorkspace.Capabilities.TRAINERS_PERIOD_VIEW))
        app.launch(hello, device = listOf(language.tag), meApi = me, workspacesApi = workspaces, clientsApi = clients)
        compose.waitUntilTagExists(HomeTags.OPEN_PROFILE)

        compose.onNodeWithTag(HomeTags.OPEN_CLIENTS).assertDoesNotExist()
    }

    // AC7: the overview edits name, address and language, and shows the change.
    @Test
    fun test_F006_AC7_editChangesTheOverview() {
        launch()
        openClients()
        compose.onNodeWithTag("${ClientsTags.ROW}.${mark.id}").performClick()
        compose.waitUntilTagExists(ClientProfileTags.EDIT)
        compose.onNodeWithTag(ClientProfileTags.OVERVIEW).assertTextEquals(string(R.string.clients_profile_overview))

        compose.onNodeWithTag(ClientProfileTags.EDIT).performClick()
        compose.waitUntilTagExists("${ClientProfileTags.EDIT_PREFIX}.name")
        compose.onNodeWithTag(
            ClientProfileTags.EDIT_TITLE,
        ).assertTextEquals(string(R.string.clients_profile_edit_title))
        compose.onNodeWithTag("${ClientProfileTags.EDIT_PREFIX}.name").performTextReplacement("Mark Visser")
        compose.onNodeWithTag("${ClientProfileTags.EDIT_PREFIX}.email").performTextReplacement("mark@example.com")
        // Typing shows the keyboard and its animation runs outside Compose's idling; tap the language once it is gone (#569).
        app.hideKeyboard(compose)
        compose.onNodeWithTag("${ClientProfileTags.EDIT_PREFIX}.language.en").performClick()
        compose.onNodeWithTag("${ClientProfileTags.EDIT_PREFIX}.language.en").assertIsSelected()
        compose.onNodeWithTag(ClientProfileTags.EDIT_SAVE).performClick()

        compose.waitUntilTagExists(ClientProfileTags.NAME)
        compose.onNodeWithTag(ClientProfileTags.NAME).assertTextEquals("Mark Visser")
        compose.onNodeWithTag(ClientProfileTags.EMAIL).assertTextEquals("mark@example.com")
        compose.onNodeWithTag(
            ClientProfileTags.LANGUAGE,
        ).assertTextEquals(string(R.string.clients_add_dialog_locale_en))
        compose.waitUntilTagExists(ClientProfileTags.SNACKBAR)
        compose.onNodeWithText(string(R.string.clients_profile_saved)).assertIsDisplayed()
    }

    // AC7: the address can't be cleared. Emptied, the save is refused by the API (400 on `email`), the edit stays open with
    // the field message, and the overview keeps the address.
    @Test
    fun test_F006_AC7_anEmptiedAddressIsRefusedWithAFieldMessageAndTheOverviewKeepsIt() {
        launch()
        openClients()
        compose.onNodeWithTag("${ClientsTags.ROW}.${mark.id}").performClick()
        compose.waitUntilTagExists(ClientProfileTags.EDIT)
        compose.onNodeWithTag(ClientProfileTags.EDIT).performClick()
        compose.waitUntilTagExists("${ClientProfileTags.EDIT_PREFIX}.email")
        compose.onNodeWithTag("${ClientProfileTags.EDIT_PREFIX}.email").performTextReplacement("")

        compose.onNodeWithTag(ClientProfileTags.EDIT_SAVE).performClick()

        compose.waitUntilUnmergedTagExists("${ClientProfileTags.EDIT_PREFIX}.emailError")
        compose.onNodeWithTag("${ClientProfileTags.EDIT_PREFIX}.emailError", useUnmergedTree = true)
            .assertTextEquals(string(R.string.clients_add_dialog_errors_email_invalid))
        compose.onNodeWithTag(ClientProfileTags.EDIT_SAVE).assertExists()
        assertEquals("mark.jansen@example.com", clients.clients.first { it.id == mark.id }.email)
    }

    // AC10, AC12: the API refuses the save (403): the edit closes, as the add form does, and Bewerken is hidden.
    @Test
    @Permission
    fun test_F006_AC12_aSaveTheApiRefusesClosesTheEditAndHidesBewerken() {
        launch()
        openClients()
        compose.onNodeWithTag("${ClientsTags.ROW}.${mark.id}").performClick()
        compose.waitUntilTagExists(ClientProfileTags.EDIT)
        compose.onNodeWithTag(ClientProfileTags.EDIT).performClick()
        compose.waitUntilTagExists("${ClientProfileTags.EDIT_PREFIX}.name")
        compose.onNodeWithTag("${ClientProfileTags.EDIT_PREFIX}.name").performTextReplacement("Mark Visser")
        // The refusal makes the capability helper read the account again.
        me.answerAccount(capabilities = listOf(MeWorkspace.Capabilities.CLIENTS_PERIOD_VIEW))
        clients.updateAnswers += { _, _ -> clients.status(403) }

        compose.onNodeWithTag(ClientProfileTags.EDIT_SAVE).performClick()

        compose.waitUntilTagExists(ClientProfileTags.NAME)
        compose.onNodeWithTag(ClientProfileTags.NAME).assertTextEquals("Mark Jansen")
        compose.onNodeWithTag(ClientProfileTags.EDIT_SAVE).assertDoesNotExist()
        compose.onNodeWithTag(ClientProfileTags.EDIT).assertDoesNotExist()
    }

    @Test
    fun test_F006_AC7_backFromTheEditLeavesWithoutSaving() {
        launch()
        openClients()
        compose.onNodeWithTag("${ClientsTags.ROW}.${mark.id}").performClick()
        compose.waitUntilTagExists(ClientProfileTags.EDIT)
        compose.onNodeWithTag(ClientProfileTags.EDIT).performClick()
        compose.waitUntilTagExists("${ClientProfileTags.EDIT_PREFIX}.name")

        app.pressBack()

        compose.waitUntilTagExists(ClientProfileTags.NAME)
        compose.onNodeWithTag(ClientProfileTags.NAME).assertTextEquals("Mark Jansen")
        app.pressBack()
        compose.waitUntilTagExists(ClientsTags.LIST)
        app.pressBack()
        compose.waitUntilTagExists(HomeTags.OPEN_CLIENTS)
    }

    // The offline pattern: the list read before stays, with a banner and the time it was read.
    @Test
    fun test_F006_AC12_aListReadBeforeStaysWithTheOfflineBanner() {
        launch()
        openClients()
        compose.onNodeWithTag("${ClientsTags.ROW_NAME}.${anna.id}", useUnmergedTree = true).assertIsDisplayed()

        clients.failure = java.io.IOException("offline")
        // On foreground the language reads the account again (F010 AC2).
        me.answerAccount()
        app.backgroundAndForeground()

        compose.waitUntilTagExists(ClientsTags.OFFLINE)
        compose.onNodeWithTag(
            ClientsTags.OFFLINE,
        ).assertTextContains(string(R.string.clients_offline, "").trim().substringBefore("."), substring = true)
        compose.onNodeWithTag("${ClientsTags.ROW_NAME}.${anna.id}", useUnmergedTree = true).assertIsDisplayed()
    }

    @Test
    fun test_F006_AC12_aFailedFirstLoadShowsTheErrorAndRetry() {
        launch()
        clients.failure = java.io.IOException("offline")
        compose.onNodeWithTag(HomeTags.OPEN_CLIENTS).performClick()
        compose.waitUntilTagExists(ClientsTags.ERROR)
        compose.onNodeWithTag(ClientsTags.ERROR).assertTextEquals(string(R.string.clients_load_error))

        clients.failure = null
        compose.onNodeWithTag(ClientsTags.RETRY).performClick()

        compose.waitUntilUnmergedTagExists("${ClientsTags.ROW_NAME}.${anna.id}")
    }

    @Test
    @Permission
    fun test_F006_AC10_aListTheApiRefusesShowsTheNoPermissionText() {
        launch()
        // The refusal makes the capability helper read the account again.
        me.answerAccount(capabilities = listOf(MeWorkspace.Capabilities.TRAINERS_PERIOD_VIEW))
        clients.listStatus = 403
        compose.onNodeWithTag(HomeTags.OPEN_CLIENTS).performClick()

        compose.waitUntilTagExists(ClientsTags.NO_PERMISSION)
        compose.onNodeWithText(string(R.string.no_permission_body, "John's Gym")).assertIsDisplayed()
    }

    // A row and a text field merge their children into one node (what TalkBack reads); their parts are in the unmerged tree.
    private fun ComposeTestRule.waitUntilUnmergedTagExists(tag: String) = waitUntil(UI_TIMEOUT_MILLIS) {
        onAllNodes(hasTestTag(tag), useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty()
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}

package app.fivvi.pro.clients

import app.fivvi.api.models.Client
import app.fivvi.api.models.UpdateClientRequest
import app.fivvi.core.me.workspaceIdOf
import app.fivvi.core.quarantine.Permission
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

// TM-03 Klantprofiel (F006 AC7, AC12): the overview shows the fields the API returns, and an edit sends only what changed.
@OptIn(ExperimentalCoroutinesApi::class)
class ClientProfileViewModelTest {
    private val api = FakeClientsApi()
    private val workspace = workspaceIdOf("John's Gym")
    private val notAllowed = mutableListOf<Int>()
    private val saveNotAllowed = mutableListOf<Int>()
    private val anna = clientOf("Anna de Vries", "anna@example.com", Client.EmailLocale.EN)
    private val mark = clientOf("Mark Jansen")

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        api.clients += listOf(anna, mark)
    }

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun viewModel(client: Client = anna) = ClientProfileViewModel(
        api,
        workspace,
        client.id,
        onNotAllowed = { notAllowed += it.code() },
        onSaveNotAllowed = { saveNotAllowed += it.code() },
    )

    private fun ClientProfileViewModel.loaded() = state.value as ClientProfileState.Loaded

    @Test
    fun test_F006_AC12_theOverviewShowsNameAddressAndLanguage() {
        val viewModel = viewModel()

        assertEquals(anna, viewModel.loaded().client)
        assertNull(viewModel.loaded().edit)
    }

    @Test
    fun test_F006_AC1_aClientWithoutALanguageIsShownWithItsAddressAndTheDefault() {
        val viewModel = viewModel(mark)

        assertEquals(mark.email, viewModel.loaded().client.email)
        assertNull(viewModel.loaded().client.emailLocale)
    }

    @Test
    fun test_F006_AC12_noConnectionShowsTheErrorAndRetryReadsAgain() {
        api.failure = IOException("offline")
        val viewModel = viewModel()
        assertEquals(ClientProfileState.Failed, viewModel.state.value)

        api.failure = null
        viewModel.retry()

        assertEquals(anna, viewModel.loaded().client)
    }

    @Test
    fun test_F006_AC10_aClientTheApiDoesNotKnowIsNoAccess() {
        val viewModel = ClientProfileViewModel(api, workspace, clientIdOf("Nobody"))

        assertEquals(ClientProfileState.NoAccess, viewModel.state.value)
    }

    @Test
    @Permission
    fun test_F006_AC10_aForbiddenReadTellsTheCapabilityHelper() {
        api.getStatus = 403

        val viewModel = viewModel()

        assertEquals(ClientProfileState.NoAccess, viewModel.state.value)
        assertEquals(listOf(403), notAllowed)
    }

    @Test
    fun test_F006_AC7_editStartsFromTheStoredFields() {
        val viewModel = viewModel()

        viewModel.startEdit()

        assertEquals(
            ClientForm("Anna de Vries", "anna@example.com", EmailLanguageChoice.English),
            viewModel.loaded().edit?.form,
        )
    }

    @Test
    fun test_F006_AC7_changingTheNameSendsOnlyTheName() {
        val viewModel = viewModel()
        viewModel.startEdit()
        viewModel.onNameChange("Anna Visser")

        viewModel.save()

        assertEquals(listOf(anna.id to UpdateClientRequest(name = "Anna Visser")), api.updated)
        assertEquals("Anna Visser", viewModel.loaded().client.name)
        assertNull(viewModel.loaded().edit)
        assertTrue(viewModel.loaded().saved)
    }

    @Test
    fun test_F006_AC7_changingTheAddressAndTheLanguageSendsBoth() {
        val viewModel = viewModel()
        viewModel.startEdit()
        viewModel.onEmailChange("Anna.Visser@Example.com")
        viewModel.onLanguageChange(EmailLanguageChoice.Dutch)

        viewModel.save()

        assertEquals(
            UpdateClientRequest(email = "Anna.Visser@Example.com", emailLocale = UpdateClientRequest.EmailLocale.NL_NL),
            api.updated.single().second,
        )
        assertEquals("anna.visser@example.com", viewModel.loaded().client.email)
    }

    // AC7: the address can't be cleared. An emptied field is sent as it is (the API refuses it with a field message,
    // `400`), the form stays open with that message, and the client keeps its address.
    @Test
    fun test_F006_AC7_anEmptiedAddressIsRefusedWithAFieldMessageAndTheClientKeepsIt() {
        api.updateAnswers += { _, _ -> api.refused("email" to "invalid_format") }
        val viewModel = viewModel()
        viewModel.startEdit()
        viewModel.onEmailChange("  ")

        viewModel.save()

        assertEquals(UpdateClientRequest(email = ""), api.updated.single().second)
        assertEquals(EmailError.Invalid, viewModel.loaded().edit?.emailError)
        assertFalse(viewModel.loaded().edit?.pending ?: true)
        assertEquals("anna@example.com", viewModel.loaded().client.email)
    }

    // AC7: a name or language edit leaves the address out of the request; the address is never sent as null or cleared.
    @Test
    fun test_F006_AC7_anEditThatKeepsTheAddressLeavesItOutOfTheRequest() {
        val viewModel = viewModel()
        viewModel.startEdit()
        viewModel.onNameChange("Anna de Vries-Smit")

        viewModel.save()

        assertEquals(UpdateClientRequest(name = "Anna de Vries-Smit"), api.updated.single().second)
        assertEquals("anna@example.com", viewModel.loaded().client.email)
    }

    @Test
    fun test_F006_AC7_choosingTheDefaultLanguageSendsTheClearFlag() {
        val viewModel = viewModel()
        viewModel.startEdit()
        viewModel.onLanguageChange(EmailLanguageChoice.Default)

        viewModel.save()

        assertEquals(UpdateClientRequest(clearEmailLocale = true), api.updated.single().second)
        assertNull(viewModel.loaded().client.emailLocale)
    }

    @Test
    fun test_F006_AC7_anAddressForAClientWithoutOneIsSetNotCleared() {
        val viewModel = viewModel(mark)
        viewModel.startEdit()
        viewModel.onEmailChange("mark@example.com")

        viewModel.save()

        assertEquals(UpdateClientRequest(email = "mark@example.com"), api.updated.single().second)
    }

    @Test
    fun test_F006_AC7_savingWithoutAChangeSendsNothingAndLeavesTheEdit() {
        val viewModel = viewModel()
        viewModel.startEdit()
        // The address in another case is the same address.
        viewModel.onEmailChange("Anna@Example.com")

        viewModel.save()

        assertTrue(api.updated.isEmpty())
        assertNull(viewModel.loaded().edit)
    }

    @Test
    fun test_F006_AC7_cancelLeavesTheEditWithoutSaving() {
        val viewModel = viewModel()
        viewModel.startEdit()
        viewModel.onNameChange("Other")

        viewModel.cancelEdit()

        assertNull(viewModel.loaded().edit)
        assertEquals("Anna de Vries", viewModel.loaded().client.name)
        assertTrue(api.updated.isEmpty())
    }

    // AC7: the rules of adding apply, and the same messages.
    @Test
    fun test_F006_AC7_aBlankNameIsRefusedWithTheFieldMessageAndTheInputStays() {
        api.updateAnswers += { _, _ -> api.refused("name" to "too_small") }
        val viewModel = viewModel()
        viewModel.startEdit()
        viewModel.onNameChange("  ")

        viewModel.save()

        val edit = viewModel.loaded().edit!!
        assertEquals(NameError.Required, edit.nameError)
        assertEquals("  ", edit.form.name)
        assertFalse(edit.pending)
        assertEquals("Anna de Vries", viewModel.loaded().client.name)
    }

    @Test
    fun test_F006_AC7_aTooLongNameAndAnInvalidAddressAreWordedAsWebDoes() {
        api.updateAnswers += { _, _ -> api.refused("name" to "too_big", "email" to "invalid_format") }
        val viewModel = viewModel()
        viewModel.startEdit()
        viewModel.onNameChange("x".repeat(121))
        viewModel.onEmailChange("nope")

        viewModel.save()

        assertEquals(NameError.TooLong, viewModel.loaded().edit?.nameError)
        assertEquals(EmailError.Invalid, viewModel.loaded().edit?.emailError)
    }

    @Test
    fun test_F006_AC7_theDuplicateRuleOffersTheOtherClient() {
        api.updateAnswers += { _, _ -> api.exists(mark.id) }
        val viewModel = viewModel()
        viewModel.startEdit()
        viewModel.onEmailChange("mark@example.com")

        viewModel.save()

        assertEquals(Duplicate(mark.id, "Mark Jansen"), viewModel.loaded().edit?.duplicate)
        assertEquals("anna@example.com", viewModel.loaded().client.email)
    }

    @Test
    fun test_F006_AC12_aFailedSaveSaysNotSavedAndKeepsTheInput() {
        val viewModel = viewModel()
        viewModel.startEdit()
        viewModel.onNameChange("Anna Visser")
        api.failure = IOException("offline")

        viewModel.save()

        val edit = viewModel.loaded().edit!!
        assertTrue(edit.failed)
        assertEquals("Anna Visser", edit.form.name)
        assertEquals("Anna de Vries", viewModel.loaded().client.name)
    }

    @Test
    @Permission
    fun test_F006_AC12_aForbiddenSaveTellsTheCapabilityHelperAboutManageNotView() {
        api.updateAnswers += { _, _ -> api.status(403) }
        val viewModel = viewModel()
        viewModel.startEdit()
        viewModel.onNameChange("Anna Visser")

        viewModel.save()

        assertEquals(listOf(403), saveNotAllowed)
        assertEquals(emptyList<Int>(), notAllowed)
        assertTrue(viewModel.loaded().edit!!.notAllowed)
    }

    @Test
    fun test_F006_AC12_theSavedConfirmationIsShownOnce() {
        val viewModel = viewModel()
        viewModel.startEdit()
        viewModel.onNameChange("Anna Visser")
        viewModel.save()
        assertTrue(viewModel.loaded().saved)

        viewModel.onSavedShown()

        assertFalse(viewModel.loaded().saved)
    }

    @Test
    fun test_F006_AC7_theProfileShowsTheChangeFromTheNextLoad() {
        val viewModel = viewModel()
        api.clients[api.clients.indexOf(anna)] = Client(anna.id, "Anna de Vries-Smit", anna.email, anna.emailLocale)

        viewModel.refresh()

        assertEquals("Anna de Vries-Smit", viewModel.loaded().client.name)
    }

    @Test
    fun test_F006_AC12_aRefreshThatFailsKeepsTheClientOnScreen() {
        val viewModel = viewModel()
        api.failure = IOException("offline")

        viewModel.refresh()

        assertEquals(anna, viewModel.loaded().client)
    }
}

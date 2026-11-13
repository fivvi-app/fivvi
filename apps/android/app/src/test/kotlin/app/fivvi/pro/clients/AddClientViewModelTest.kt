package app.fivvi.pro.clients

import app.fivvi.api.models.AddClientRequest
import app.fivvi.api.models.Client
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

// *+ Nieuwe klant* (F006 AC1, AC2, AC3, AC12): the form sends the name, the address and the language to the API, which
// words the field errors and answers 409 with the client that has the address.
@OptIn(ExperimentalCoroutinesApi::class)
class AddClientViewModelTest {
    private val api = FakeClientsApi()
    private val workspace = workspaceIdOf("John's Gym")
    private val notAllowed = mutableListOf<Int>()
    private val anna = clientOf("Anna de Vries", "anna@example.com")

    @Before
    fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun viewModel() = AddClientViewModel(api, workspace, onNotAllowed = { notAllowed += it.code() })

    // AC1: a name and an email address; the language follows the workspace's default, so the request carries none.
    @Test
    fun test_F006_AC1_addsAClientWithANameAndAnEmailOnTheAndroidSurface() {
        val viewModel = viewModel()
        viewModel.onNameChange("Mark Jansen")
        viewModel.onEmailChange("mark@example.com")

        viewModel.submit()

        assertEquals(
            listOf(AddClientRequest("Mark Jansen", "mark@example.com", null, AddClientRequest.Surface.ANDROID)),
            api.added,
        )
        assertEquals("Mark Jansen", viewModel.state.value.added?.name)
        assertNull(viewModel.state.value.added?.emailLocale)
    }

    @Test
    fun test_F006_AC2_sendsTheAddressAndTheChosenLanguageAndLeavesCaseToTheApi() {
        val viewModel = viewModel()
        viewModel.onNameChange("Anna de Vries")
        viewModel.onEmailChange("  Anna@Example.com ")
        viewModel.onLanguageChange(EmailLanguageChoice.English)

        viewModel.submit()

        assertEquals(
            listOf(
                AddClientRequest(
                    "Anna de Vries",
                    "Anna@Example.com",
                    AddClientRequest.EmailLocale.EN,
                    AddClientRequest.Surface.ANDROID,
                ),
            ),
            api.added,
        )
        assertEquals(Client.EmailLocale.EN, viewModel.state.value.added?.emailLocale)
    }

    @Test
    fun test_F006_AC2_theDutchChoiceIsSentAsNlNl() {
        val viewModel = viewModel()
        viewModel.onNameChange("Mark")
        viewModel.onEmailChange("mark@example.com")
        viewModel.onLanguageChange(EmailLanguageChoice.Dutch)

        viewModel.submit()

        assertEquals(AddClientRequest.EmailLocale.NL_NL, api.added.single().emailLocale)
    }

    // AC2: nothing is checked in the app; the API's codes word the messages and the input stays.
    @Test
    fun test_F006_AC2_aBlankNameIsRefusedByTheApiAndWordedAsRequired() {
        api.addAnswers += { api.refused("name" to "too_small") }
        val viewModel = viewModel()
        viewModel.onNameChange("   ")
        viewModel.onEmailChange("anna@example.com")

        viewModel.submit()

        val state = viewModel.state.value
        assertEquals(NameError.Required, state.nameError)
        assertNull(state.emailError)
        assertNull(state.added)
        assertFalse(state.pending)
        assertEquals("   ", state.form.name)
        assertEquals("anna@example.com", state.form.email)
    }

    @Test
    fun test_F006_AC2_aTooLongNameIsWordedAsTooLong() {
        api.addAnswers += { api.refused("name" to "too_big") }
        val viewModel = viewModel()
        viewModel.onNameChange("x".repeat(121))
        viewModel.onEmailChange("mark@example.com")

        viewModel.submit()

        assertEquals(NameError.TooLong, viewModel.state.value.nameError)
    }

    @Test
    fun test_F006_AC2_anInvalidAddressIsWordedAsInvalidAndEditingClearsTheMessage() {
        api.addAnswers += { api.refused("email" to "invalid_format") }
        val viewModel = viewModel()
        viewModel.onNameChange("Mark")
        viewModel.onEmailChange("not an address")

        viewModel.submit()
        assertEquals(EmailError.Invalid, viewModel.state.value.emailError)

        viewModel.onEmailChange("mark@example.com")
        assertNull(viewModel.state.value.emailError)
    }

    // AC1, AC2: the address is required. Without one the request carries an empty address (nothing is checked in the
    // app), the API refuses it with a field message, and nothing is added. The typed name stays.
    @Test
    fun test_F006_AC2_aMissingAddressIsRefusedByTheApiAndWordedAsInvalid() {
        val viewModel = viewModel()
        viewModel.onNameChange("Mark Jansen")

        viewModel.submit()

        val state = viewModel.state.value
        assertEquals(listOf(""), api.added.map { it.email })
        assertEquals(EmailError.Invalid, state.emailError)
        assertNull(state.nameError)
        assertNull(state.added)
        assertFalse(state.pending)
        assertEquals("Mark Jansen", state.form.name)
        assertTrue(api.clients.isEmpty())
    }

    @Test
    fun test_F006_AC2_anAddressOfOnlySpacesIsSentEmptyAndRefused() {
        val viewModel = viewModel()
        viewModel.onNameChange("Mark Jansen")
        viewModel.onEmailChange("   ")

        viewModel.submit()

        assertEquals(listOf(""), api.added.map { it.email })
        assertEquals(EmailError.Invalid, viewModel.state.value.emailError)
        assertNull(viewModel.state.value.added)
    }

    // AC3: the 409 names a client of this workspace; the form offers to open it and creates nothing.
    @Test
    fun test_F006_AC3_theSameAddressOffersTheExistingClientAndAddsNoSecondOne() {
        api.clients += anna
        api.addAnswers += { api.exists(anna.id) }
        val viewModel = viewModel()
        viewModel.onNameChange("Anna")
        viewModel.onEmailChange("ANNA@example.com")

        viewModel.submit()

        val state = viewModel.state.value
        assertEquals(Duplicate(anna.id, "Anna de Vries"), state.duplicate)
        assertNull(state.added)
        assertFalse(state.failed)
        assertEquals(1, api.clients.size)
    }

    @Test
    fun test_F006_AC3_useAnotherAddressClosesTheOfferAndKeepsWhatWasTyped() {
        api.clients += anna
        api.addAnswers += { api.exists(anna.id) }
        val viewModel = viewModel()
        viewModel.onNameChange("Anna")
        viewModel.onEmailChange("anna@example.com")
        viewModel.submit()

        viewModel.useAnotherEmail()

        assertNull(viewModel.state.value.duplicate)
        assertEquals("anna@example.com", viewModel.state.value.form.email)
        assertEquals("Anna", viewModel.state.value.form.name)
    }

    @Test
    fun test_F006_AC3_typingANewAddressClosesTheOffer() {
        api.clients += anna
        api.addAnswers += { api.exists(anna.id) }
        val viewModel = viewModel()
        viewModel.onNameChange("Anna")
        viewModel.onEmailChange("anna@example.com")
        viewModel.submit()

        viewModel.onEmailChange("anna2@example.com")

        assertNull(viewModel.state.value.duplicate)
    }

    @Test
    fun test_F006_AC3_aClientTheAppCantNameIsNotSavedRatherThanGuessed() {
        api.addAnswers += { api.exists(anna.id) }
        val viewModel = viewModel()
        viewModel.onNameChange("Anna")
        viewModel.onEmailChange("anna@example.com")

        viewModel.submit()

        assertNull(viewModel.state.value.duplicate)
        assertTrue(viewModel.state.value.failed)
    }

    // AC12: adding needs a connection; a failed add keeps the input and says so.
    @Test
    fun test_F006_AC12_noConnectionSaysNotSavedAndKeepsTheInput() {
        api.failure = IOException("offline")
        val viewModel = viewModel()
        viewModel.onNameChange("Mark Jansen")
        viewModel.onEmailChange("mark@example.com")
        viewModel.onLanguageChange(EmailLanguageChoice.English)

        viewModel.submit()

        val state = viewModel.state.value
        assertTrue(state.failed)
        assertFalse(state.pending)
        assertEquals(ClientForm("Mark Jansen", "mark@example.com", EmailLanguageChoice.English), state.form)

        api.failure = null
        viewModel.submit()
        assertFalse(viewModel.state.value.failed)
        assertEquals("Mark Jansen", viewModel.state.value.added?.name)
    }

    @Test
    fun test_F006_AC12_aServerErrorSaysNotSaved() {
        api.addAnswers += { api.status(500) }
        val viewModel = viewModel()
        viewModel.onNameChange("Mark")

        viewModel.submit()

        assertTrue(viewModel.state.value.failed)
    }

    // F004 AC10: a 403 hides *+ Nieuwe klant* at once through the capability helper.
    @Test
    @Permission
    fun test_F006_AC12_aRefusedAddTellsTheCapabilityHelperAndClosesTheForm() {
        api.addAnswers += { api.status(403) }
        val viewModel = viewModel()
        viewModel.onNameChange("Mark")

        viewModel.submit()

        assertEquals(listOf(403), notAllowed)
        assertTrue(viewModel.state.value.notAllowed)
    }

    @Test
    fun test_F006_AC12_theFormIsOnlySentOnceWhileItIsPending() {
        val viewModel = viewModel()
        viewModel.onNameChange("Mark")
        viewModel.onEmailChange("mark@example.com")
        viewModel.submit()
        // The first add is done; a second submit of an added form sends nothing.
        viewModel.submit()

        assertEquals(1, api.added.size)
    }
}

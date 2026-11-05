package app.fivvi.client.account

import app.fivvi.api.models.MeResponse
import app.fivvi.api.models.MeWorkspace
import app.fivvi.core.auth.AuthState
import app.fivvi.core.auth.InMemorySessionStore
import app.fivvi.core.auth.Session
import app.fivvi.core.me.FakeMeApi
import app.fivvi.core.signin.FakeSignInApi
import java.io.IOException
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import retrofit2.Response

// Synthetic people (AGENTS.md, D8): Anna de Vries has an account and no workspace; Sarah is a Trainer of John's Gym.
@OptIn(ExperimentalCoroutinesApi::class)
class AccountViewModelTest {
    private val dispatcher = UnconfinedTestDispatcher()
    private val api = FakeMeApi()
    private val signInApi = FakeSignInApi()
    private val store = InMemorySessionStore("tok-1")
    private val session = Session(store)
    private val identified = mutableListOf<String>()
    private val stored = mutableListOf<MeResponse.PreferredLocale?>()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun viewModel() = AccountViewModel(
        api,
        session,
        signOutApi = { signInApi },
        onAccount = { identified += it },
        onPreferredLocale = { stored += it },
        io = dispatcher,
    )

    @Test
    fun E017_AC1_anAccountWithoutAWorkspaceLoadsWithItsNameAndEmailAddress() {
        api.answerAccount(email = "anna@example.com", name = "Anna de Vries", workspaces = emptyList())

        val viewModel = viewModel()

        assertEquals(
            AccountState.Loaded("Anna de Vries", "anna@example.com", hasTeamRole = false),
            viewModel.state.value,
        )
    }

    @Test
    fun E017_AC3_aTrainerHasATeamRoleAndTheStateHoldsNoTeamData() {
        api.answerAccount(
            email = "trainer@example.com",
            name = "Sarah",
            workspaces = listOf("John's Gym"),
            role = MeWorkspace.Role.TRAINER,
        )

        val viewModel = viewModel()

        // Only the flag: no workspace name, ID, slug, role or capability reaches the screen.
        assertEquals(AccountState.Loaded("Sarah", "trainer@example.com", hasTeamRole = true), viewModel.state.value)
    }

    @Test
    fun E017_AC3_anOwnerHasATeamRoleToo() {
        api.answerAccount(workspaces = listOf("Sarah Personal Training"), role = MeWorkspace.Role.OWNER)

        assertEquals(true, (viewModel().state.value as AccountState.Loaded).hasTeamRole)
    }

    @Test
    fun E017_AC1_aFailedReadCanBeTriedAgain() {
        api.answers += { throw IOException("offline") }
        api.answerAccount(email = "anna@example.com", name = "Anna de Vries", workspaces = emptyList())

        val viewModel = viewModel()
        assertEquals(AccountState.Failed, viewModel.state.value)

        viewModel.retry()
        assertEquals(AccountState.Loaded("Anna de Vries", "anna@example.com", false), viewModel.state.value)
    }

    @Test
    fun E017_AC1_anAnswerThatIsNotASuccessIsAFailure() {
        api.answers += { Response.error(500, "{}".toResponseBody()) }

        assertEquals(AccountState.Failed, viewModel().state.value)
    }

    @Test
    fun E017_AC1_aNameTheAccountDoesNotHaveIsNull() {
        api.answerAccount(email = "anna@example.com", name = null, workspaces = emptyList())

        assertNull((viewModel().state.value as AccountState.Loaded).name)
    }

    @Test
    fun E017_AC10_theAccountIdAndTheStoredLanguageArePassedOn() {
        val id = UUID.fromString("0b9c4f2e-5d6a-4c1b-9e8f-1a2b3c4d5e6f")
        api.answerAccount(id = id, workspaces = emptyList(), preferredLocale = MeResponse.PreferredLocale.EN)

        viewModel()

        assertEquals(listOf(id.toString()), identified)
        assertEquals(listOf<MeResponse.PreferredLocale?>(MeResponse.PreferredLocale.EN), stored)
    }

    @Test
    fun E017_AC10_anAnswerAfterTheSignOutPassesNothingOn() {
        api.answerAccount(workspaces = emptyList())
        val viewModel = viewModel()
        identified.clear()
        stored.clear()
        session.signedOut()
        api.answerAccount(workspaces = emptyList())

        viewModel.retry()

        assertEquals(emptyList<String>(), identified)
        assertEquals(emptyList<MeResponse.PreferredLocale?>(), stored)
    }

    @Test
    fun E017_AC3_theForegroundReadUpdatesTheTeamRoleWithoutAnotherLoadingState() {
        api.answerAccount(email = "anna@example.com", name = "Anna de Vries", workspaces = emptyList())
        val viewModel = viewModel()
        api.answerAccount(
            email = "anna@example.com",
            name = "Anna de Vries",
            workspaces = listOf("John's Gym"),
            role = MeWorkspace.Role.TRAINER,
        )

        viewModel.refresh()

        assertEquals(
            AccountState.Loaded("Anna de Vries", "anna@example.com", hasTeamRole = true),
            viewModel.state.value,
        )
    }

    // F010 AC3 (E017 AC2): the stored language of a foreground read is LanguageViewModel's to take, with its guard against
    // a choice made while the read was under way; the account's own foreground read must not pass it on.
    @Test
    fun E017_AC2_theForegroundReadDoesNotPassTheStoredLanguageOn() {
        api.answerAccount(workspaces = emptyList(), preferredLocale = MeResponse.PreferredLocale.NL_NL)
        val viewModel = viewModel()
        stored.clear()
        api.answerAccount(workspaces = emptyList(), preferredLocale = MeResponse.PreferredLocale.NL_NL)

        viewModel.refresh()

        assertEquals(emptyList<MeResponse.PreferredLocale?>(), stored)
        assertEquals(2, api.calls)
    }

    @Test
    fun E017_AC9_aForegroundReadThatFailsLeavesTheScreenAsItWas() {
        api.answerAccount(email = "anna@example.com", name = "Anna de Vries", workspaces = emptyList())
        val viewModel = viewModel()
        val before = viewModel.state.value
        api.answers += { throw IOException("offline") }

        viewModel.refresh()

        assertEquals(before, viewModel.state.value)
    }

    @Test
    fun E017_AC9_aForegroundReadBeforeTheFirstAnswerDoesNothing() {
        api.answers += { throw IOException("offline") }
        val viewModel = viewModel()

        viewModel.refresh()

        assertEquals(AccountState.Failed, viewModel.state.value)
        assertEquals(1, api.calls)
    }

    @Test
    fun E017_AC2_signOutDeletesTheTokenAndShowsSignIn() {
        api.answerAccount(workspaces = emptyList())
        signInApi.answerSignedOut()
        val viewModel = viewModel()
        val generation = session.state.value.generation

        viewModel.signOut()

        assertNull(store.read())
        assertEquals(1, signInApi.signOuts)
        assertEquals(AuthState(signedIn = false, generation = generation + 1), session.state.value)
    }
}

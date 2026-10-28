package app.fivvi.pro.home

import app.fivvi.api.models.MeResponse
import app.fivvi.pro.auth.AuthState
import app.fivvi.pro.auth.InMemorySessionStore
import app.fivvi.pro.auth.Session
import app.fivvi.pro.signin.FakeSignInApi
import java.io.IOException
import java.util.UUID
import kotlin.time.Duration.Companion.seconds
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestCoroutineScheduler
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

// Synthetic ID (AGENTS.md, D8).
private val ACCOUNT_ID = UUID.fromString("0b9c4f2e-5d6a-4c1b-9e8f-1a2b3c4d5e6f")

/** What `GET /v1/me` answers for the account: no workspace yet (the app's workspace states come with F002). */
private fun ownerAccount() = MeResponse(
    id = ACCOUNT_ID,
    email = "owner@example.com",
    name = "Owner",
    preferredLocale = MeResponse.PreferredLocale.NL_NL,
    canCreateWorkspace = false,
    workspaces = emptyList(),
)

@OptIn(ExperimentalCoroutinesApi::class)
class HomeViewModelTest {
    private val api = FakeMeApi()
    private val signInApi = FakeSignInApi()
    private val store = InMemorySessionStore("tok-1")
    private val session = Session(store, onSignedOut = { clears++ })

    // The clock of the sign-out's wait: the test dispatcher's virtual time.
    private val scheduler = TestCoroutineScheduler()
    private val dispatcher = UnconfinedTestDispatcher(scheduler)

    // The token each sign-out call was made with.
    private val signOutTokens = mutableListOf<String>()

    // The account IDs the screen passed on for error reporting, and the sign-outs the session reported.
    private val identified = mutableListOf<String>()
    private var clears = 0

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun viewModel() = HomeViewModel(
        api,
        session,
        signOutApi = { token ->
            signOutTokens += token
            signInApi
        },
        onAccount = { identified += it },
        io = dispatcher,
    )

    @Test
    fun F001N_AC4_showsTheAccountsAddress() {
        api.answerAccount("owner@example.com")

        val viewModel = viewModel()

        assertEquals(MeState.Loaded("owner@example.com"), viewModel.state.value)
        assertEquals(1, api.calls)
    }

    @Test
    fun F001N_266_AC2_passesTheAccountIdOnOnceTheApiHasAnswered() {
        val answer = CompletableDeferred<Response<MeResponse>>()
        api.answers += { answer.await() }
        viewModel()
        assertEquals(emptyList<String>(), identified)

        answer.complete(Response.success(ownerAccount()))

        assertEquals(listOf(ACCOUNT_ID.toString()), identified)
    }

    @Test
    fun F001N_266_AC2_passesNothingOnWhenTheApiDoesNotAnswerWithTheAccount() {
        api.answers += { throw IOException("offline") }
        api.answers += { Response.error(401, "{}".toResponseBody()) }
        val viewModel = viewModel()

        viewModel.retry()

        assertEquals(emptyList<String>(), identified)
    }

    @Test
    fun F001N_266_AC3_anAnswerAfterTheSignOutPassesNothingOn() {
        val answer = CompletableDeferred<Response<MeResponse>>()
        api.answers += { answer.await() }
        signInApi.answerSignedOut()
        val viewModel = viewModel()
        viewModel.signOut()
        assertEquals(1, clears)

        answer.complete(Response.success(ownerAccount()))

        assertEquals(emptyList<String>(), identified)
    }

    @Test
    fun F001N_266_AC3_anAnswerAfterTheTokenWasRejectedPassesNothingOn() {
        val answer = CompletableDeferred<Response<MeResponse>>()
        api.answers += { answer.await() }
        viewModel()
        session.expire("tok-1")

        answer.complete(Response.success(ownerAccount()))

        assertEquals(emptyList<String>(), identified)
    }

    @Test
    fun F001N_266_AC3_signingOutClearsTheReportingUser() {
        api.answerAccount(id = ACCOUNT_ID)
        signInApi.answerSignedOut()
        val viewModel = viewModel()
        assertEquals(0, clears)

        viewModel.signOut()

        assertEquals(1, clears)
    }

    @Test
    fun F001N_AC4_loadsUntilTheApiAnswers() {
        val answer = CompletableDeferred<Response<MeResponse>>()
        api.answers += { answer.await() }

        val viewModel = viewModel()

        assertEquals(MeState.Loading, viewModel.state.value)
    }

    @Test
    fun F001N_AC4_offlineShowsRetry() {
        api.answers += { throw IOException("offline") }
        api.answerAccount()
        val viewModel = viewModel()
        assertEquals(MeState.Failed, viewModel.state.value)

        viewModel.retry()

        assertEquals(MeState.Loaded("owner@example.com"), viewModel.state.value)
    }

    @Test
    fun F001N_AC4_rejectedTokenFails() {
        // The auth layer signs the app out on this 401 (AuthInterceptorTest); the screen only has to not show an address.
        api.answers += { Response.error(401, "{}".toResponseBody()) }

        assertEquals(MeState.Failed, viewModel().state.value)
    }

    @Test
    fun F001N_AC10_signOutEndsTheSessionDeletesTheTokenAndShowsSignIn() {
        api.answerAccount()
        signInApi.answerSignedOut()
        val viewModel = viewModel()
        val generation = session.state.value.generation

        viewModel.signOut()

        assertEquals(listOf("tok-1"), signOutTokens)
        assertEquals(1, signInApi.signOuts)
        assertNull(store.read())
        assertEquals(AuthState(signedIn = false, generation = generation + 1), session.state.value)
        assertEquals(false, viewModel.signingOut.value)
    }

    @Test
    fun F001N_AC10_theTokenIsDeletedBeforeTheRequestAnswers() {
        api.answerAccount()
        val answer = CompletableDeferred<Response<Unit>>()
        signInApi.signOutAnswers += { answer.await() }
        val viewModel = viewModel()

        viewModel.signOut()

        // A phone that is switched off now, or an app that is killed, opens signed out; the request still has its token.
        assertNull(store.read())
        assertNull(session.token())
        assertEquals(listOf("tok-1"), signOutTokens)
        assertEquals(true, viewModel.signingOut.value)
        assertEquals(true, session.state.value.signedIn)

        answer.complete(Response.success(204, Unit))
        assertEquals(false, session.state.value.signedIn)
    }

    @Test
    fun F001N_AC10_signOutDeletesTokenEvenOffline() {
        api.answerAccount()
        signInApi.signOutAnswers += { throw IOException("offline") }
        val viewModel = viewModel()

        viewModel.signOut()

        assertNull(store.read())
        assertEquals(false, session.state.value.signedIn)
        assertEquals(false, session.state.value.afterRejection)
    }

    @Test
    fun F001N_AC10_signOutRefusedByTheApiShowsTheNotice() {
        api.answerAccount()
        signInApi.signOutAnswers += { Response.error(401, "{}".toResponseBody()) }
        val viewModel = viewModel()

        viewModel.signOut()

        assertNull(store.read())
        assertEquals(false, session.state.value.signedIn)
        assertEquals(true, session.state.value.afterRejection)
    }

    @Test
    fun F001N_AC10_aServerErrorStillSignsOutWithoutNotice() {
        api.answerAccount()
        signInApi.signOutAnswers += { Response.error(500, "{}".toResponseBody()) }
        val viewModel = viewModel()

        viewModel.signOut()

        assertEquals(false, session.state.value.signedIn)
        assertEquals(false, session.state.value.afterRejection)
    }

    @Test
    fun F001N_AC10_signOutDoesNotWaitForAHangingConnection() {
        api.answerAccount()
        signInApi.signOutAnswers += { CompletableDeferred<Response<Unit>>().await() }
        val viewModel = viewModel()

        viewModel.signOut()
        scheduler.advanceTimeBy(9.seconds)
        scheduler.runCurrent()
        assertEquals(true, session.state.value.signedIn)
        assertEquals(true, viewModel.signingOut.value)

        // The ten seconds are over: the sign-in screen shows, whatever the connection does.
        scheduler.advanceTimeBy(1.seconds)
        scheduler.runCurrent()
        assertEquals(false, session.state.value.signedIn)
        assertEquals(false, session.state.value.afterRejection)
        assertNull(store.read())
    }

    @Test
    fun F001N_AC10_aSignOutThatAnswersInTimeStopsTheWait() {
        api.answerAccount()
        val answer = CompletableDeferred<Response<Unit>>()
        signInApi.signOutAnswers += { answer.await() }
        val viewModel = viewModel()
        viewModel.signOut()
        scheduler.advanceTimeBy(5.seconds)
        scheduler.runCurrent()

        answer.complete(Response.success(204, Unit))

        // Nothing is left to wait for at the ten seconds: the timer ended with the answer.
        assertEquals(false, session.state.value.signedIn)
        scheduler.advanceUntilIdle()
        assertEquals(5_000L, scheduler.currentTime)
    }

    @Test
    fun F001N_AC10_aSecondTapWhileSigningOutIsIgnored() {
        api.answerAccount()
        val answer = CompletableDeferred<Response<Unit>>()
        signInApi.signOutAnswers += { answer.await() }
        val viewModel = viewModel()

        viewModel.signOut()
        viewModel.signOut()

        assertEquals(1, signInApi.signOuts)
        assertEquals(listOf("tok-1"), signOutTokens)
    }

    @Test
    fun F001N_AC10_signOutWithoutATokenSkipsTheRequest() {
        val empty = Session(InMemorySessionStore())
        api.answerAccount()
        val viewModel = HomeViewModel(api, empty, { signInApi }, { identified += it }, dispatcher)

        viewModel.signOut()

        assertEquals(0, signInApi.signOuts)
        assertEquals(false, empty.state.value.signedIn)
    }
}

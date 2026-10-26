package app.fivvi.pro.home

import app.fivvi.pro.auth.AuthState
import app.fivvi.pro.auth.InMemorySessionStore
import app.fivvi.pro.auth.Session
import app.fivvi.pro.signin.FakeSignInApi
import java.io.IOException
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

@OptIn(ExperimentalCoroutinesApi::class)
class HomeViewModelTest {
    private val api = FakeMeApi()
    private val signInApi = FakeSignInApi()
    private val store = InMemorySessionStore("tok-1")
    private val session = Session(store)

    // The clock of the sign-out's wait: the test dispatcher's virtual time.
    private val scheduler = TestCoroutineScheduler()
    private val dispatcher = UnconfinedTestDispatcher(scheduler)

    // The token each sign-out call was made with.
    private val signOutTokens = mutableListOf<String>()

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
    fun F001N_AC4_loadsUntilTheApiAnswers() {
        val answer = CompletableDeferred<Response<app.fivvi.api.models.MeResponse>>()
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
        val viewModel = HomeViewModel(api, empty, { signInApi }, dispatcher)

        viewModel.signOut()

        assertEquals(0, signInApi.signOuts)
        assertEquals(false, empty.state.value.signedIn)
    }
}

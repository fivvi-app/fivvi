package app.fivvi.pro.home

import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import retrofit2.Response

@OptIn(ExperimentalCoroutinesApi::class)
class HomeViewModelTest {
    private val api = FakeMeApi()

    @Before
    fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After
    fun tearDown() = Dispatchers.resetMain()

    @Test
    fun F001N_AC4_showsTheAccountsAddress() {
        api.answerAccount("owner@example.com")

        val viewModel = HomeViewModel(api)

        assertEquals(MeState.Loaded("owner@example.com"), viewModel.state.value)
        assertEquals(1, api.calls)
    }

    @Test
    fun F001N_AC4_loadsUntilTheApiAnswers() {
        val answer = CompletableDeferred<Response<app.fivvi.api.models.MeResponse>>()
        api.answers += { answer.await() }

        val viewModel = HomeViewModel(api)

        assertEquals(MeState.Loading, viewModel.state.value)
    }

    @Test
    fun F001N_AC4_offlineShowsRetry() {
        api.answers += { throw IOException("offline") }
        api.answerAccount()
        val viewModel = HomeViewModel(api)
        assertEquals(MeState.Failed, viewModel.state.value)

        viewModel.retry()

        assertEquals(MeState.Loaded("owner@example.com"), viewModel.state.value)
    }

    @Test
    fun F001N_AC4_rejectedTokenFails() {
        // The auth layer signs the app out on this 401 (AuthInterceptorTest); the screen only has to not show an address.
        api.answers += { Response.error(401, "{}".toResponseBody()) }

        assertEquals(MeState.Failed, HomeViewModel(api).state.value)
    }
}

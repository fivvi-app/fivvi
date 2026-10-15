package nl.trainerhub.app.hello

import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import nl.trainerhub.api.models.HelloResponse
import nl.trainerhub.app.AppLanguage
import nl.trainerhub.app.R
import nl.trainerhub.app.appLanguageParameters
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized
import retrofit2.Response

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(Parameterized::class)
class HelloViewModelTest(@Suppress("UNUSED_PARAMETER") tag: String, private val language: AppLanguage) {
    private val api = FakeHelloApi()

    @Before
    fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun viewModel() = HelloViewModel(api, language.apiLocale)

    @Test
    fun E008_AC2_loadsGreetingInAppLanguage() {
        api.answerGreeting()

        val viewModel = viewModel()

        assertEquals(listOf(language.apiLocale), api.requestedLocales)
        assertEquals(HelloState.Loaded(R.string.hello_title), viewModel.state.value)
    }

    @Test
    fun E008_AC4_networkErrorShowsRetry() {
        api.answers += { throw IOException("offline") }

        assertEquals(HelloState.Failed, viewModel().state.value)
    }

    @Test
    fun E008_AC4_serverErrorFails() {
        api.answers += { Response.error(500, "{}".toResponseBody()) }

        assertEquals(HelloState.Failed, viewModel().state.value)
    }

    @Test
    fun E008_AC4_unknownKeyFails() {
        api.answerGreeting("hello.somethingNew")

        assertEquals(HelloState.Failed, viewModel().state.value)
    }

    @Test
    fun E008_AC4_retryLoadsGreeting() {
        api.answers += { throw IOException("offline") }
        api.answerGreeting()
        val viewModel = viewModel()

        viewModel.retry()

        assertEquals(HelloState.Loaded(R.string.hello_title), viewModel.state.value)
        assertEquals(listOf(language.apiLocale, language.apiLocale), api.requestedLocales)
    }

    @Test
    fun E008_AC5_loadsUntilTheApiAnswers() {
        val answer = CompletableDeferred<Response<HelloResponse>>()
        api.answers += { answer.await() }
        val viewModel = viewModel()

        assertEquals(HelloState.Loading, viewModel.state.value)

        answer.complete(Response.success(HelloResponse("hello.title", language.apiLocale)))
        assertEquals(HelloState.Loaded(R.string.hello_title), viewModel.state.value)
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}

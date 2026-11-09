package app.fivvi.core.auth

import app.fivvi.core.signin.FakeSignInApi
import java.io.IOException
import kotlin.time.Duration.Companion.seconds
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestCoroutineScheduler
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import retrofit2.Response

/**
 * Sign out (F001 AC10), the part both apps share: the token goes first, the request carries a copy of it, and the
 * sign-in shows whatever the answer, also offline. The home of Fivvi Pro and the Profiel of Fivvi both run it.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class SignOutTest {
    private val store = InMemorySessionStore("tok-1")
    private val session = Session(store)
    private val api = FakeSignInApi()
    private val scheduler = TestCoroutineScheduler()
    private val dispatcher = UnconfinedTestDispatcher(scheduler)
    private val tokens = mutableListOf<String>()

    private fun signOut() = SignOut(
        session,
        signOutApi = { token ->
            tokens += token
            api
        },
        scope = TestScope(dispatcher),
        io = dispatcher,
    )

    @Test
    fun F001N_AC10_endsTheSessionDeletesTheTokenAndShowsSignIn() {
        api.answerSignedOut()
        val generation = session.state.value.generation

        signOut().start()

        assertEquals(listOf("tok-1"), tokens)
        assertEquals(1, api.signOuts)
        assertNull(store.read())
        assertEquals(AuthState(signedIn = false, generation = generation + 1), session.state.value)
    }

    @Test
    fun F001N_AC10_theTokenIsDeletedBeforeTheRequestAnswers() {
        val answer = CompletableDeferred<Response<Unit>>()
        api.signOutAnswers += { answer.await() }
        val signOut = signOut()

        signOut.start()

        assertNull(store.read())
        assertNull(session.token())
        assertEquals(true, signOut.signingOut.value)
        assertEquals(true, session.state.value.signedIn)
        // A second tap while it is under way does nothing.
        signOut.start()
        assertEquals(listOf("tok-1"), tokens)

        answer.complete(Response.success(204, Unit))
        assertEquals(false, session.state.value.signedIn)
        assertEquals(false, signOut.signingOut.value)
    }

    @Test
    fun F001N_AC10_deletesTheTokenEvenOffline() {
        api.signOutAnswers += { throw IOException("offline") }

        signOut().start()

        assertNull(store.read())
        assertEquals(false, session.state.value.signedIn)
        assertEquals(false, session.state.value.afterRejection)
    }

    @Test
    fun F001N_AC10_aRefusedTokenShowsTheNotice() {
        api.signOutAnswers += { Response.error(401, "{}".toResponseBody()) }

        signOut().start()

        assertEquals(false, session.state.value.signedIn)
        assertEquals(true, session.state.value.afterRejection)
    }

    @Test
    fun F001N_AC10_doesNotWaitForAHangingConnectionLongerThanTenSeconds() {
        api.signOutAnswers += { CompletableDeferred<Response<Unit>>().await() }

        signOut().start()
        scheduler.advanceTimeBy(9.seconds)
        scheduler.runCurrent()
        assertEquals(true, session.state.value.signedIn)

        scheduler.advanceTimeBy(1.seconds)
        scheduler.runCurrent()
        assertEquals(false, session.state.value.signedIn)
        assertEquals(false, session.state.value.afterRejection)
    }
}

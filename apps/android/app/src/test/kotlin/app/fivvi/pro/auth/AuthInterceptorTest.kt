package app.fivvi.pro.auth

import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AuthInterceptorTest {
    private val network = FakeNetwork()
    private val sent get() = network.sent

    // The OkHttp client with the interceptor, over a network that records the request and answers with its status.
    private fun client(session: Session) = OkHttpClient.Builder()
        .addInterceptor(AuthInterceptor(session))
        .addInterceptor(network)
        .build()

    private fun get(session: Session): Response = client(session).newCall(Request.Builder().url(URL).build()).execute()

    @Test
    fun F001N_AC4_addsBearerHeader() {
        get(Session(InMemorySessionStore("tok-1"))).close()

        assertEquals("Bearer tok-1", sent.single().header("Authorization"))
    }

    @Test
    fun F001N_AC13_sendsNoHeaderWithoutToken() {
        get(Session(InMemorySessionStore())).close()

        assertNull(sent.single().header("Authorization"))
    }

    @Test
    fun F001N_AC9_unauthorizedWithTokenSignsOut() {
        val store = InMemorySessionStore("tok-1")
        val session = Session(store)
        network.status = 401

        val response = get(session)

        // The answer still reaches the caller.
        assertEquals(401, response.code)
        response.close()
        assertNull(store.read())
        assertEquals(false, session.state.value.signedIn)
    }

    @Test
    fun F001N_AC6_unauthorizedWithoutTokenIsNotASignOut() {
        // A refused code answers 401 to a request that carries no token: the person is signed out already.
        val session = Session(InMemorySessionStore())
        network.status = 401

        get(session).close()

        assertEquals(0, session.state.value.generation)
    }

    @Test
    fun F001N_AC9_aLateAnswerForAnOldTokenKeepsTheNewSignIn() {
        val store = InMemorySessionStore("old")
        val session = Session(store)
        // The old token's request is still on its way when the person signs in again; then its 401 arrives.
        val client = OkHttpClient.Builder()
            .addInterceptor(AuthInterceptor(session))
            .addInterceptor { chain ->
                session.signIn("new")
                network.status = 401
                network.intercept(chain)
            }
            .build()

        client.newCall(Request.Builder().url(URL).build()).execute().close()

        assertEquals("Bearer old", sent.single().header("Authorization"))
        assertEquals("new", store.read())
        assertEquals(true, session.state.value.signedIn)
    }

    @Test
    fun F001N_AC4_otherAnswersKeepTheToken() {
        val store = InMemorySessionStore("tok-1")
        network.status = 500

        get(Session(store)).close()

        assertEquals("tok-1", store.read())
    }

    private companion object {
        const val URL = "https://example.com/api/v1/me"
    }
}

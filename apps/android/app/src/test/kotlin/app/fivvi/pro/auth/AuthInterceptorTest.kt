package app.fivvi.pro.auth

import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AuthInterceptorTest {
    private val sent = mutableListOf<Request>()
    private var status = 200

    // The OkHttp client with the interceptor, over a network that records the request and answers with [status].
    private fun client(session: Session) = OkHttpClient.Builder()
        .addInterceptor(AuthInterceptor(session))
        .addInterceptor(
            Interceptor { chain ->
                sent += chain.request()
                Response.Builder()
                    .request(chain.request())
                    .protocol(Protocol.HTTP_1_1)
                    .code(status)
                    .message("")
                    .body("{}".toResponseBody())
                    .build()
            },
        )
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
        status = 401

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
        status = 401

        get(session).close()

        assertEquals(0, session.state.value.generation)
    }

    @Test
    fun F001N_AC4_otherAnswersKeepTheToken() {
        val store = InMemorySessionStore("tok-1")
        status = 500

        get(Session(store)).close()

        assertEquals("tok-1", store.read())
    }

    private companion object {
        const val URL = "https://example.com/api/v1/me"
    }
}

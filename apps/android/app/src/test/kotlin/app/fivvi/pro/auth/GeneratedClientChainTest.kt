package app.fivvi.pro.auth

import app.fivvi.api.apis.MeApi
import app.fivvi.api.apis.SignInApi
import app.fivvi.api.infrastructure.ApiClient
import app.fivvi.api.models.Locale
import app.fivvi.api.models.SignInRequest
import app.fivvi.api.models.SignInTokenRequest
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

// The spike's chain without a server: the generated Retrofit client, our auth layer on its OkHttp client, and a network
// that records the request and answers with JSON in the contract's shapes.
class GeneratedClientChainTest {
    private val sent = mutableListOf<Request>()
    private val bodies = mutableListOf<String>()
    private var status = 200
    private var json = "{}"

    private fun apiClient(session: Session) = ApiClient(
        "https://example.com/api/",
        OkHttpClient.Builder().addInterceptor(AuthInterceptor(session)).addInterceptor(
            Interceptor { chain ->
                sent += chain.request()
                bodies += chain.request().body?.let { Buffer().also(it::writeTo).readUtf8() }.orEmpty()
                Response.Builder()
                    .request(chain.request())
                    .protocol(Protocol.HTTP_1_1)
                    .code(status)
                    .message("")
                    .body(json.toResponseBody("application/json".toMediaType()))
                    .build()
            },
        ),
    )

    @Test
    fun F001N_AC4_meIsCalledWithTheBearerToken() = runBlocking {
        json = """{"id":"3f0b1c2e-8a54-4b51-9a42-6a1a3a1d9b10","email":"owner@example.com","preferredLocale":"nl-NL"}"""
        val me = apiClient(Session(InMemorySessionStore("tok-1"))).createService(MeApi::class.java)

        val response = me.getMe()

        assertEquals("https://example.com/api/v1/me", sent.single().url.toString())
        assertEquals("Bearer tok-1", sent.single().header("Authorization"))
        assertEquals("owner@example.com", response.body()?.email)
    }

    @Test
    fun F001N_AC4_rejectedTokenSignsTheAppOut() = runBlocking {
        val store = InMemorySessionStore("tok-1")
        val session = Session(store)
        status = 401
        val me = apiClient(session).createService(MeApi::class.java)

        val response = me.getMe()

        assertEquals(401, response.code())
        assertNull(store.read())
        assertEquals(false, session.state.value.signedIn)
    }

    @Test
    fun F001N_AC1_signInRequestBodyIsTheContractsWithNoToken() = runBlocking {
        status = 202
        val signIn = apiClient(Session(InMemorySessionStore())).createService(SignInApi::class.java)

        signIn.requestSignIn(SignInRequest("owner@example.com", Locale.NL_NL))

        assertEquals("https://example.com/api/v1/sign-in/request", sent.single().url.toString())
        assertEquals("""{"email":"owner@example.com","locale":"nl-NL"}""", bodies.single())
        assertNull(sent.single().header("Authorization"))
    }

    @Test
    fun F001N_AC3_codeExchangeReturnsTheTokenAndARefusedCodeDoesNotSignOut() = runBlocking {
        json = """{"token":"tok-9"}"""
        val session = Session(InMemorySessionStore())
        val signIn = apiClient(session).createService(SignInApi::class.java)

        assertEquals(
            "tok-9",
            signIn.exchangeSignInCode(SignInTokenRequest("owner@example.com", "123456")).body()?.token,
        )
        assertEquals("""{"email":"owner@example.com","code":"123456"}""", bodies.single())

        status = 401
        assertEquals(401, signIn.exchangeSignInCode(SignInTokenRequest("owner@example.com", "000000")).code())
        assertEquals(0, session.state.value.generation)
    }
}

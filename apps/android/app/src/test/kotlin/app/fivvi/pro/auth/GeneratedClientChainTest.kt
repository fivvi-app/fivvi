package app.fivvi.pro.auth

import app.fivvi.api.apis.MeApi
import app.fivvi.api.apis.SignInApi
import app.fivvi.api.models.Locale
import app.fivvi.api.models.SignInRequest
import app.fivvi.api.models.SignInTokenRequest
import java.io.ByteArrayOutputStream
import java.io.PrintStream
import java.util.logging.Handler
import java.util.logging.LogRecord
import java.util.logging.Logger
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

// The spike's chain without a server: the generated Retrofit client, our auth layer on its OkHttp client, and a network
// that records the request and answers with JSON in the contract's shapes.
class GeneratedClientChainTest {
    private val network = FakeNetwork()
    private val sent get() = network.sent
    private val bodies get() = network.bodies

    private fun apiClient(session: Session) = ApiServices("https://example.com/api/", session, network)

    @Test
    fun F001N_AC4_meIsCalledWithTheBearerToken() = runBlocking {
        network.json =
            """{"id":"3f0b1c2e-8a54-4b51-9a42-6a1a3a1d9b10","email":"owner@example.com","name":"Owner",""" +
            """"preferredLocale":"nl-NL","canCreateWorkspace":false,"workspaces":[]}"""
        val me = apiClient(Session(InMemorySessionStore("tok-1"))).meApi

        val response = me.getMe()

        assertEquals("https://example.com/api/v1/me", sent.single().url.toString())
        assertEquals("Bearer tok-1", sent.single().header("Authorization"))
        assertEquals("owner@example.com", response.body()?.email)
    }

    @Test
    fun F001N_AC4_rejectedTokenSignsTheAppOut() = runBlocking {
        val store = InMemorySessionStore("tok-1")
        val session = Session(store)
        network.status = 401
        val me = apiClient(session).meApi

        val response = me.getMe()

        assertEquals(401, response.code())
        assertNull(store.read())
        assertEquals(false, session.state.value.signedIn)
    }

    @Test
    fun F001N_AC1_signInRequestBodyIsTheContractsWithNoToken() = runBlocking {
        network.status = 202
        val signIn = apiClient(Session(InMemorySessionStore())).signInApi

        signIn.requestSignIn(SignInRequest("owner@example.com", Locale.NL_NL))

        assertEquals("https://example.com/api/v1/sign-in/request", sent.single().url.toString())
        assertEquals("""{"email":"owner@example.com","locale":"nl-NL"}""", bodies.single())
        assertNull(sent.single().header("Authorization"))
    }

    @Test
    fun F001N_AC10_signOutIsCalledWithTheTokenItIsGiven() = runBlocking {
        network.status = 204
        // The stored token is gone (deleted first) or another one by now: the request carries the one it was made for.
        val session = Session(InMemorySessionStore("newer"))
        val signOut = apiClient(session).signOutApi("older")

        val response = signOut.signOut()

        assertEquals(204, response.code())
        assertEquals("POST", sent.single().method)
        assertEquals("https://example.com/api/v1/sign-out", sent.single().url.toString())
        assertEquals("Bearer older", sent.single().header("Authorization"))
    }

    @Test
    fun F001N_AC10_aRefusedSignOutDoesNotSignOutAnotherSignIn() = runBlocking {
        network.status = 401
        val store = InMemorySessionStore("newer")
        val session = Session(store)

        val response = apiClient(session).signOutApi("older").signOut()

        assertEquals(401, response.code())
        assertEquals("newer", store.read())
        assertEquals(true, session.state.value.signedIn)
    }

    @Test
    fun F001N_AC3_codeExchangeReturnsTheTokenAndARefusedCodeDoesNotSignOut() = runBlocking {
        network.json = """{"token":"tok-9"}"""
        val session = Session(InMemorySessionStore())
        val signIn = apiClient(session).signInApi

        assertEquals(
            "tok-9",
            signIn.exchangeSignInCode(SignInTokenRequest("owner@example.com", "123456")).body()?.token,
        )
        assertEquals("""{"email":"owner@example.com","code":"123456"}""", bodies.single())

        network.status = 401
        assertEquals(401, signIn.exchangeSignInCode(SignInTokenRequest("owner@example.com", "000000")).code())
        assertEquals(0, session.state.value.generation)
    }

    @Test
    fun F001N_AC12_theClientsLogNeitherTheTokenTheCodeNorTheAddress() = runBlocking {
        val output = ByteArrayOutputStream()
        val records = mutableListOf<String>()
        val handler = object : Handler() {
            override fun publish(record: LogRecord) {
                records += "${record.message} ${record.parameters?.joinToString()} ${record.thrown}"
            }

            override fun flush() = Unit

            override fun close() = Unit
        }
        val root = Logger.getLogger("")
        val (out, err) = System.out to System.err
        root.addHandler(handler)
        System.setOut(PrintStream(output, true))
        System.setErr(PrintStream(output, true))
        try {
            network.json =
                """{"token":"tok-9","id":"3f0b1c2e-8a54-4b51-9a42-6a1a3a1d9b10","email":"owner@example.com",""" +
                """"name":"Owner","preferredLocale":"nl-NL","canCreateWorkspace":false,"workspaces":[]}"""
            val services = apiClient(Session(InMemorySessionStore("tok-1")))
            services.signInApi.exchangeSignInCode(SignInTokenRequest("owner@example.com", "493817"))
            services.signInApi.requestSignIn(SignInRequest("owner@example.com", Locale.EN))
            services.meApi.getMe()
            network.status = 401
            services.signOutApi("tok-1").signOut()
        } finally {
            System.setOut(out)
            System.setErr(err)
            root.removeHandler(handler)
        }

        val logged = output.toString() + records.joinToString("\n")
        listOf("tok-1", "tok-9", "493817", "owner@example.com", "Bearer").forEach {
            assertEquals("'$it' was logged: $logged", false, logged.contains(it))
        }
    }
}

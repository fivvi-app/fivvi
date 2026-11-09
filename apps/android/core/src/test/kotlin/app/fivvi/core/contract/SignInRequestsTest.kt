package app.fivvi.core.contract

import app.fivvi.api.apis.SignInApi
import app.fivvi.api.infrastructure.ApiClient
import app.fivvi.api.models.Locale
import app.fivvi.api.models.SignInRequest
import app.fivvi.api.models.SignInTokenRequest
import app.fivvi.core.auth.FakeNetwork
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import org.junit.Assert.assertEquals
import org.junit.Test

// #371 / F010 AC1: the other bodies the app sends today. Every field of both is required and has a value, so nothing
// is unset and no `null` goes out. The same literals are sent to the real API in `native-sign-in.integration.test.ts`
// (`{ email, locale }` and `{ email, code }`).
class SignInRequestsTest {
    private val network = FakeNetwork(status = 202, json = "")

    private val signInApi: SignInApi =
        ApiClient("https://example.com/api/", OkHttpClient.Builder().addInterceptor(network))
            .createService(SignInApi::class.java)

    @Test
    fun F010_AC1_theSignInRequestWritesTheAddressAndTheLanguage() {
        runBlocking { signInApi.requestSignIn(SignInRequest("anna@example.com", Locale.EN)) }

        assertEquals("https://example.com/api/v1/sign-in/request", network.sent.single().url.toString())
        assertEquals("""{"email":"anna@example.com","locale":"en"}""", network.bodies.single())
    }

    @Test
    fun F010_AC1_theCodeExchangeWritesTheAddressAndTheCode() {
        network.status = 200
        network.json = """{"token":"fake-token"}"""

        runBlocking { signInApi.exchangeSignInCode(SignInTokenRequest("anna@example.com", "123456")) }

        assertEquals("https://example.com/api/v1/sign-in/token", network.sent.single().url.toString())
        assertEquals("""{"email":"anna@example.com","code":"123456"}""", network.bodies.single())
    }
}

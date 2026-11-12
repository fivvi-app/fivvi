package app.fivvi.core.contract

import app.fivvi.api.apis.MeApi
import app.fivvi.api.infrastructure.ApiClient
import app.fivvi.api.models.UpdateMeRequest
import app.fivvi.core.auth.FakeNetwork
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import org.junit.Assert.assertEquals
import org.junit.Test

// #371 / F010 AC1: the bodies the app sends to `PATCH /v1/me` and the sign-in routes, as the generated Kotlin client
// writes them. The API reads `null` for a field as a value and refuses it (`400`), so the client must leave an unset
// field out, as the Swift client does: before the fix the language save went out with `"name":null` and the API
// answered 400. The same literals are sent to the real API in `packages/api/test/me.integration.test.ts` and
// `native-sign-in.integration.test.ts`. The requests go through the real generated Retrofit services, with a fake
// network as the last interceptor.
class UpdateMeRequestTest {
    private val network = FakeNetwork(json = ME_RESPONSE)

    private val meApi: MeApi =
        ApiClient("https://example.com/api/", OkHttpClient.Builder().addInterceptor(network))
            .createService(MeApi::class.java)

    @Test
    fun F010_AC1_theLanguageSaveWritesOnlyTheFieldsTheAppSet() {
        runBlocking {
            meApi.updateMe(
                UpdateMeRequest(
                    preferredLocale = UpdateMeRequest.PreferredLocale.EN,
                    surface = UpdateMeRequest.Surface.ANDROID,
                ),
            )
        }

        assertEquals("PATCH", network.sent.single().method)
        assertEquals("https://example.com/api/v1/me", network.sent.single().url.toString())
        assertEquals("""{"preferredLocale":"en","surface":"android"}""", network.bodies.single())
    }

    private companion object {
        const val ME_RESPONSE =
            """{"id":"3f0b1c2e-8a54-4b51-9a42-6a1a3a1d9b10","email":"anna@example.com","name":null,""" +
                """"preferredLocale":"en","bookingEmails":true,"canCreateWorkspace":false,"workspaces":[],"clientWorkspaces":[]}"""
    }
}

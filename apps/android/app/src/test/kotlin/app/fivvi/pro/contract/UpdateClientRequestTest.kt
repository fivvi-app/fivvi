package app.fivvi.pro.contract

import app.fivvi.api.apis.ClientsApi
import app.fivvi.api.infrastructure.ApiClient
import app.fivvi.api.models.UpdateClientRequest
import app.fivvi.pro.auth.FakeNetwork
import java.util.UUID
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import okhttp3.OkHttpClient
import org.junit.Assert.assertEquals
import org.junit.Test

// F006 AC7: the edit body of `PATCH /clients/{id}` as the generated Kotlin client writes it. The generated Json has
// `encodeDefaults = true`, so a field the app did not set goes out as `null`. The contract reads `null` like a field
// left out (keep), and clears only with `clearEmail` / `clearEmailLocale`; Swift leaves a `nil` field out. The
// request goes through the real generated Retrofit service, with a fake network as the last interceptor.
class UpdateClientRequestTest {
    private val network = FakeNetwork(json = """{"id":"$CLIENT","name":"Anna","email":null,"emailLocale":null}""")

    private val clientsApi: ClientsApi =
        ApiClient("https://example.com/api/", OkHttpClient.Builder().addInterceptor(network))
            .createService(ClientsApi::class.java)

    /** The body the client sent, as the server reads it: each field's JSON, with a missing field as no entry. */
    private fun sent(request: UpdateClientRequest): JsonObject {
        runBlocking { clientsApi.updateClient(WORKSPACE, UUID.fromString(CLIENT), request) }
        assertEquals("PATCH", network.sent.single().method)
        assertEquals(
            "https://example.com/api/v1/workspaces/$WORKSPACE/clients/$CLIENT",
            network.sent.single().url.toString(),
        )
        return Json.parseToJsonElement(network.bodies.single()).jsonObject
    }

    /** What the server reads from [field]: nothing (keep) for a missing field or `null`, else the value. */
    private fun JsonObject.value(field: String): JsonElement? = this[field]?.takeUnless { it is JsonNull }

    @Test
    fun F006_AC7_changingOnlyTheNameKeepsTheEmailAndTheLanguage() {
        val body = sent(UpdateClientRequest(name = "Anna Visser"))

        // The Kotlin client writes `null` for what was not set ...
        assertEquals(
            """{"name":"Anna Visser","email":null,"clearEmail":null,"emailLocale":null,"clearEmailLocale":null}""",
            network.bodies.single(),
        )
        // ... which the contract reads as "keep": no value and no clear flag.
        assertEquals("Anna Visser", body.value("name")?.toString()?.trim('"'))
        for (field in listOf("email", "clearEmail", "emailLocale", "clearEmailLocale")) {
            assertEquals(field, null, body.value(field))
        }
    }

    @Test
    fun F006_AC7_clearingTheEmailIsTheClearFlagAndNoEmail() {
        val body = sent(UpdateClientRequest(clearEmail = true))

        assertEquals("true", body.value("clearEmail")?.toString())
        for (field in listOf("name", "email", "emailLocale", "clearEmailLocale")) {
            assertEquals(field, null, body.value(field))
        }
    }

    @Test
    fun F006_AC7_resettingTheLanguageIsTheClearFlagAndNoLanguage() {
        val body = sent(UpdateClientRequest(clearEmailLocale = true))

        assertEquals("true", body.value("clearEmailLocale")?.toString())
        for (field in listOf("name", "email", "emailLocale", "clearEmail")) {
            assertEquals(field, null, body.value(field))
        }
    }

    @Test
    fun F006_AC7_settingTheEmailAndTheLanguageSendsTheValuesAndNoClearFlag() {
        val body = sent(
            UpdateClientRequest(email = "anna@example.com", emailLocale = UpdateClientRequest.EmailLocale.NL_NL),
        )

        assertEquals("\"anna@example.com\"", body.value("email")?.toString())
        assertEquals("\"nl-NL\"", body.value("emailLocale")?.toString())
        for (field in listOf("name", "clearEmail", "clearEmailLocale")) {
            assertEquals(field, null, body.value(field))
        }
    }

    private companion object {
        val WORKSPACE: UUID = UUID.fromString("0b6d3c1e-5f0a-4c2b-9a41-7a1f2d3e4b50")
        const val CLIENT = "3f0b1c2e-8a54-4b51-9a42-6a1a3a1d9b10"
    }
}

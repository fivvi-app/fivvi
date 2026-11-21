package app.fivvi.core.auth

import okhttp3.OkHttpClient
import okhttp3.Request
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

// The language of the app goes with every request (F013, the note of #604): an account with no stored language reads the
// server's text (a class name) in the language shown, not in the English fallback.
class AcceptLanguageInterceptorTest {
    private val network = FakeNetwork()

    private fun send(tag: () -> String?, header: String? = null) {
        val client = OkHttpClient.Builder().addInterceptor(
            AcceptLanguageInterceptor(tag),
        ).addInterceptor(network).build()
        client.newCall(
            Request.Builder().url("https://example.com/api/v1/me/day").apply {
                header?.let { header("Accept-Language", it) }
            }.build(),
        )
            .execute().close()
    }

    @Test
    fun test_F013_note604_everyRequestCarriesTheLanguageShown() {
        var language: String? = "nl-NL"

        send({ language })
        language = "en"
        send({ language })

        assertEquals(listOf("nl-NL", "en"), network.sent.map { it.header("Accept-Language") })
    }

    @Test
    fun test_F013_note604_noLanguageSendsNoHeader() {
        send({ null })

        assertNull(network.sent.single().header("Accept-Language"))
    }
}

package nl.trainerhub.app.hello

import nl.trainerhub.api.apis.HelloApi
import nl.trainerhub.api.models.HelloResponse
import nl.trainerhub.api.models.Locale as ApiLocale
import retrofit2.Response

/** The generated client's own API interface, answering each call with the next queued answer. */
class FakeHelloApi : HelloApi {
    val answers = ArrayDeque<suspend (ApiLocale) -> Response<HelloResponse>>()
    val requestedLocales = mutableListOf<ApiLocale?>()

    override suspend fun getHello(locale: ApiLocale?): Response<HelloResponse> {
        requestedLocales += locale
        return answers.removeFirst()(checkNotNull(locale))
    }

    fun answerGreeting(key: String = "hello.title") {
        answers += { Response.success(HelloResponse(key, it)) }
    }
}

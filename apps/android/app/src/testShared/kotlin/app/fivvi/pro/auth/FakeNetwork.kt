package app.fivvi.pro.auth

import java.io.IOException
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer

/**
 * A network for tests, as the last interceptor of an OkHttp client: records each request (and its body) and answers
 * with [status] and the JSON [json], with no server, or, while [offline], with the failure of a lost connection.
 */
class FakeNetwork(var status: Int = 200, var json: String = "{}", var offline: Boolean = false) : Interceptor {
    val sent = mutableListOf<Request>()
    val bodies = mutableListOf<String>()

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        sent += request
        bodies += request.body?.let { Buffer().also(it::writeTo).readUtf8() }.orEmpty()
        if (offline) throw IOException("offline")
        return Response.Builder()
            .request(request)
            .protocol(Protocol.HTTP_1_1)
            .code(status)
            .message("")
            .body(json.toResponseBody("application/json".toMediaType()))
            .build()
    }
}

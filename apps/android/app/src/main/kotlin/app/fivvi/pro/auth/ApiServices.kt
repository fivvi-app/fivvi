package app.fivvi.pro.auth

import app.fivvi.api.apis.HelloApi
import app.fivvi.api.apis.MeApi
import app.fivvi.api.apis.SignInApi
import app.fivvi.api.infrastructure.ApiClient
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Response

/**
 * The generated API clients of the app, on one OkHttp client with the auth layer ([AuthInterceptor]). Our own OkHttp
 * builder, so the generated client's logging interceptor (which can print request bodies) isn't there: nothing logs the
 * token, the code or the address. [network], when given, is the last interceptor of every client: tests answer with it
 * instead of a server.
 */
class ApiServices(private val baseUrl: String, session: Session, private val network: Interceptor? = null) {
    // The connection pool and dispatcher are shared by every client made from this one.
    private val plain = OkHttpClient()
    private val authenticated = plain.newBuilder().addInterceptor(AuthInterceptor(session)).withNetwork().build()

    private val apiClient: ApiClient by lazy { ApiClient(baseUrl, authenticated.newBuilder()) }
    val helloApi: HelloApi by lazy { apiClient.createService(HelloApi::class.java) }
    val signInApi: SignInApi by lazy { apiClient.createService(SignInApi::class.java) }
    val meApi: MeApi by lazy { apiClient.createService(MeApi::class.java) }

    /**
     * The sign-in API for one request that carries [token] instead of the session's: sign-out deletes the stored token
     * before the request goes out (AC10). The auth layer isn't on this client, so an answer of 401, which is for [token]
     * only, can't sign out another sign-in.
     */
    fun signOutApi(token: String): SignInApi =
        ApiClient(baseUrl, plain.newBuilder().addInterceptor(BearerInterceptor(token)).withNetwork())
            .createService(SignInApi::class.java)

    private fun OkHttpClient.Builder.withNetwork(): OkHttpClient.Builder = apply { network?.let(::addInterceptor) }
}

/** Adds `Authorization: Bearer <token>` with one fixed token, whatever the session holds. */
private class BearerInterceptor(private val token: String) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response =
        chain.proceed(chain.request().newBuilder().header("Authorization", "Bearer $token").build())
}

package app.fivvi.core.auth

import app.fivvi.api.apis.BookingLinksApi
import app.fivvi.api.apis.ClientsApi
import app.fivvi.api.apis.GroupClassesApi
import app.fivvi.api.apis.LocationsApi
import app.fivvi.api.apis.MeApi
import app.fivvi.api.apis.SessionsApi
import app.fivvi.api.apis.SignInApi
import app.fivvi.api.apis.TrainersApi
import app.fivvi.api.apis.WorkspacesApi
import app.fivvi.api.infrastructure.ApiClient
import app.fivvi.api.infrastructure.Serializer
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Response
import retrofit2.Converter
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import retrofit2.converter.scalars.ScalarsConverterFactory

/**
 * The generated API clients of the app, on one OkHttp client with the auth layer ([AuthInterceptor]). Our own OkHttp
 * builder, so the generated client's logging interceptor (which can print request bodies) isn't there: nothing logs the
 * token, the code or the address. [network], when given, is the last interceptor of every client: tests answer with it
 * instead of a server. [acceptLanguage], when given, is the language the app shows, sent as `Accept-Language` with each
 * request (not with the one sign-out request, which carries no text of the account).
 */
class ApiServices(
    private val baseUrl: String,
    session: Session,
    private val network: Interceptor? = null,
    acceptLanguage: (() -> String?)? = null,
) {
    // The connection pool and dispatcher are shared by every client made from this one.
    private val plain = OkHttpClient()
    private val authenticated = plain.newBuilder()
        .apply { acceptLanguage?.let { addInterceptor(AcceptLanguageInterceptor(it)) } }
        .addInterceptor(AuthInterceptor(session))
        .withNetwork()
        .build()

    private val apiClient: ApiClient by lazy {
        ApiClient(baseUrl, authenticated.newBuilder(), converterFactories = CONVERTERS)
    }
    val signInApi: SignInApi by lazy { apiClient.createService(SignInApi::class.java) }
    val meApi: MeApi by lazy { apiClient.createService(MeApi::class.java) }
    val workspacesApi: WorkspacesApi by lazy { apiClient.createService(WorkspacesApi::class.java) }
    val clientsApi: ClientsApi by lazy { apiClient.createService(ClientsApi::class.java) }
    val trainersApi: TrainersApi by lazy { apiClient.createService(TrainersApi::class.java) }
    val sessionsApi: SessionsApi by lazy { apiClient.createService(SessionsApi::class.java) }
    val locationsApi: LocationsApi by lazy { apiClient.createService(LocationsApi::class.java) }
    val groupClassesApi: GroupClassesApi by lazy { apiClient.createService(GroupClassesApi::class.java) }
    val bookingLinksApi: BookingLinksApi by lazy { apiClient.createService(BookingLinksApi::class.java) }

    /**
     * The sign-in API for one request that carries [token] instead of the session's: sign-out deletes the stored token
     * before the request goes out (AC10). The auth layer isn't on this client, so an answer of 401, which is for [token]
     * only, can't sign out another sign-in.
     */
    fun signOutApi(token: String): SignInApi = ApiClient(
        baseUrl,
        plain.newBuilder().addInterceptor(BearerInterceptor(token)).withNetwork(),
        converterFactories = CONVERTERS,
    ).createService(SignInApi::class.java)

    private fun OkHttpClient.Builder.withNetwork(): OkHttpClient.Builder = apply { network?.let(::addInterceptor) }
}

/** The generated client's converters (text, then JSON), with the one that writes an enum in a query as the contract names it. */
private val CONVERTERS: List<Converter.Factory> = listOf(
    EnumQueryConverterFactory(),
    ScalarsConverterFactory.create(),
    Serializer.kotlinxSerializationJson.asConverterFactory("application/json".toMediaType()),
)

/** Adds `Authorization: Bearer <token>` with one fixed token, whatever the session holds. */
private class BearerInterceptor(private val token: String) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response =
        chain.proceed(chain.request().newBuilder().header("Authorization", "Bearer $token").build())
}

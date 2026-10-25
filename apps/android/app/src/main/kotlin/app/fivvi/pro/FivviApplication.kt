package app.fivvi.pro

import android.app.Application
import android.content.Context
import app.fivvi.api.apis.HelloApi
import app.fivvi.api.apis.MeApi
import app.fivvi.api.apis.SignInApi
import app.fivvi.api.infrastructure.ApiClient
import app.fivvi.pro.auth.AuthInterceptor
import app.fivvi.pro.auth.KeystoreSessionStore
import app.fivvi.pro.auth.Session
import app.fivvi.pro.observability.Observability
import okhttp3.OkHttpClient

/** What the screens depend on. Instrumented tests replace it before an activity starts. */
interface AppDependencies {
    val helloApi: HelloApi
    val signInApi: SignInApi
    val meApi: MeApi
    val session: Session
    val languageSettings: LanguageSettings
}

class DefaultAppDependencies(context: Context) : AppDependencies {
    override val session: Session by lazy { Session(KeystoreSessionStore(context)) }

    // One client for every call, with the auth layer. Our own OkHttp builder, so the generated client's logging
    // interceptor (which can print request bodies) isn't there: nothing logs the token, the code or the address.
    private val apiClient: ApiClient by lazy {
        ApiClient(BuildConfig.API_BASE_URL, OkHttpClient.Builder().addInterceptor(AuthInterceptor(session)))
    }
    override val helloApi: HelloApi by lazy { apiClient.createService(HelloApi::class.java) }
    override val signInApi: SignInApi by lazy { apiClient.createService(SignInApi::class.java) }
    override val meApi: MeApi by lazy { apiClient.createService(MeApi::class.java) }
    override val languageSettings: LanguageSettings = SystemLanguageSettings(context)
}

class FivviApplication : Application() {
    lateinit var dependencies: AppDependencies

    override fun onCreate() {
        super.onCreate()
        Observability.start(this)
        dependencies = DefaultAppDependencies(this)
    }
}

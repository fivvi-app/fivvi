package app.fivvi.pro

import android.app.Application
import android.content.Context
import app.fivvi.api.apis.HelloApi
import app.fivvi.api.apis.MeApi
import app.fivvi.api.apis.SignInApi
import app.fivvi.pro.auth.ApiServices
import app.fivvi.pro.auth.KeystoreSessionStore
import app.fivvi.pro.auth.Session
import app.fivvi.pro.observability.Observability

/** What the screens depend on. Instrumented tests replace it before an activity starts. */
interface AppDependencies {
    val helloApi: HelloApi
    val signInApi: SignInApi
    val meApi: MeApi
    val session: Session
    val languageSettings: LanguageSettings

    /** The sign-in API for the one sign-out request that carries [token] (AC10). */
    fun signOutApi(token: String): SignInApi
}

class DefaultAppDependencies(context: Context) : AppDependencies {
    override val session: Session by lazy { Session(KeystoreSessionStore(context)) }

    // One client for every call, with the auth layer, and nothing that logs.
    private val services: ApiServices by lazy { ApiServices(BuildConfig.API_BASE_URL, session) }
    override val helloApi: HelloApi get() = services.helloApi
    override val signInApi: SignInApi get() = services.signInApi
    override val meApi: MeApi get() = services.meApi
    override fun signOutApi(token: String): SignInApi = services.signOutApi(token)
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

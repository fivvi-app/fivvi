package app.fivvi.client

import android.app.Application
import android.content.Context
import app.fivvi.api.apis.MeApi
import app.fivvi.api.apis.SignInApi
import app.fivvi.client.links.AndroidBrowser
import app.fivvi.client.links.Browser
import app.fivvi.core.LanguagePreference
import app.fivvi.core.LanguageSettings
import app.fivvi.core.SharedPreferencesLanguageStore
import app.fivvi.core.SystemLanguageSettings
import app.fivvi.core.auth.ApiServices
import app.fivvi.core.auth.KeystoreSessionStore
import app.fivvi.core.auth.Session
import app.fivvi.core.observability.Observability

/** What the screens depend on. Instrumented tests replace it before an activity starts. */
interface ClientDependencies {
    val signInApi: SignInApi
    val meApi: MeApi
    val session: Session
    val languageSettings: LanguageSettings

    /** The language shown and kept (F010). */
    val languagePreference: LanguagePreference
    val connectivity: Connectivity

    /** Opens an address in the phone's browser (the opened-link screen, E017 #506). */
    val browser: Browser

    /** The sign-in API for the one sign-out request that carries [token] (F001 AC10). */
    fun signOutApi(token: String): SignInApi
}

class DefaultClientDependencies(context: Context) : ClientDependencies {
    // Signing out, also after a rejected token, clears the error-reporting user (F001 AC3).
    override val session: Session by lazy {
        Session(KeystoreSessionStore(context), onSignedOut = Observability::clearUser)
    }

    // One client for every call, with the auth layer, and nothing that logs.
    private val services: ApiServices by lazy { ApiServices(BuildConfig.API_BASE_URL, session) }
    override val signInApi: SignInApi get() = services.signInApi
    override val meApi: MeApi get() = services.meApi
    override fun signOutApi(token: String): SignInApi = services.signOutApi(token)
    override val languageSettings: LanguageSettings = SystemLanguageSettings(context)
    override val languagePreference: LanguagePreference by lazy {
        LanguagePreference(SharedPreferencesLanguageStore(context), languageSettings)
    }
    override val connectivity: Connectivity by lazy { AndroidConnectivity(context) }
    override val browser: Browser by lazy { AndroidBrowser(context) }
}

class ClientApplication : Application() {
    lateinit var dependencies: ClientDependencies

    override fun onCreate() {
        super.onCreate()
        Observability.start(this, observabilityConfigOfThisBuild())
        dependencies = DefaultClientDependencies(this)
    }
}

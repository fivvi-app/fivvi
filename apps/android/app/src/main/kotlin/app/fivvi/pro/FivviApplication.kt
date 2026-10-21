package app.fivvi.pro

import android.app.Application
import android.content.Context
import app.fivvi.api.apis.HelloApi
import app.fivvi.api.infrastructure.ApiClient
import app.fivvi.pro.observability.Observability

/** What the screens depend on. Instrumented tests replace it before an activity starts. */
interface AppDependencies {
    val helloApi: HelloApi
    val languageSettings: LanguageSettings
}

class DefaultAppDependencies(context: Context) : AppDependencies {
    override val helloApi: HelloApi by lazy {
        ApiClient(BuildConfig.API_BASE_URL).createService(HelloApi::class.java)
    }
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

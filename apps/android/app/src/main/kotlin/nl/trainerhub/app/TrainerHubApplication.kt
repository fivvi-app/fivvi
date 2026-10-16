package nl.trainerhub.app

import android.app.Application
import android.content.Context
import nl.trainerhub.api.apis.HelloApi
import nl.trainerhub.api.infrastructure.ApiClient
import nl.trainerhub.app.observability.Observability

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

class TrainerHubApplication : Application() {
    lateinit var dependencies: AppDependencies

    override fun onCreate() {
        super.onCreate()
        Observability.start(this)
        dependencies = DefaultAppDependencies(this)
    }
}

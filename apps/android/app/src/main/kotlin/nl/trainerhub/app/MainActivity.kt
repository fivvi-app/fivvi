package nl.trainerhub.app

import android.content.Context
import android.content.res.Configuration
import android.os.Bundle
import android.os.LocaleList
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import nl.trainerhub.app.hello.HelloScreen
import nl.trainerhub.app.hello.HelloViewModel

class MainActivity : ComponentActivity() {
    private lateinit var language: AppLanguage

    // The resources follow the resolved language, not Android's own match: an unsupported device language would
    // otherwise get the default (Dutch) resources.
    override fun attachBaseContext(newBase: Context) {
        val settings = (newBase.applicationContext as TrainerHubApplication).dependencies.languageSettings
        language = AppLanguage.resolve(settings.perAppLanguages, settings.deviceLanguages)
        super.attachBaseContext(newBase)
        applyOverrideConfiguration(Configuration().apply { setLocales(LocaleList(language.locale)) })
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val api = (application as TrainerHubApplication).dependencies.helloApi
        setContent {
            // Platform default colours until the token theme (#58).
            MaterialTheme(colorScheme = if (isSystemInDarkTheme()) darkColorScheme() else lightColorScheme()) {
                // Test tags double as resource ids, so Maestro finds them as on iOS.
                Surface(Modifier.fillMaxSize().semantics { testTagsAsResourceId = true }) {
                    val viewModel = viewModel(key = language.tag) { HelloViewModel(api, language.apiLocale) }
                    val state by viewModel.state.collectAsStateWithLifecycle()
                    HelloScreen(state, onRetry = viewModel::retry)
                }
            }
        }
    }
}

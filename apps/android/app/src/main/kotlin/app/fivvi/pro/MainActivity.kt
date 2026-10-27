package app.fivvi.pro

import android.content.Context
import android.content.res.Configuration
import android.os.Bundle
import android.os.LocaleList
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.fivvi.pro.hello.HelloViewModel
import app.fivvi.pro.home.HomeScreen
import app.fivvi.pro.home.HomeViewModel
import app.fivvi.pro.observability.Observability
import app.fivvi.pro.signin.SignInActions
import app.fivvi.pro.signin.SignInScreen
import app.fivvi.pro.signin.SignInViewModel
import app.fivvi.pro.theme.FivviTheme

class MainActivity : ComponentActivity() {
    private lateinit var language: AppLanguage

    // The resources follow the resolved language, not Android's own match: an unsupported device language would
    // otherwise get the default (Dutch) resources.
    override fun attachBaseContext(newBase: Context) {
        val settings = (newBase.applicationContext as FivviApplication).dependencies.languageSettings
        language = AppLanguage.resolve(settings.perAppLanguages, settings.deviceLanguages)
        super.attachBaseContext(newBase)
        applyOverrideConfiguration(Configuration().apply { setLocales(LocaleList(language.locale)) })
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val dependencies = (application as FivviApplication).dependencies
        setContent {
            FivviTheme {
                // Test tags double as resource ids, so Maestro finds them as on iOS.
                Surface(Modifier.fillMaxSize().semantics { testTagsAsResourceId = true }) {
                    // App start: no token is the sign-in screen, with no authenticated call; a token is the home.
                    val auth by dependencies.session.state.collectAsStateWithLifecycle()
                    if (auth.signedIn) {
                        Home(dependencies, key = "${auth.generation}")
                    } else {
                        SignIn(dependencies, key = "${auth.generation}", showsSignedOutNotice = auth.afterRejection)
                    }
                }
            }
        }
    }

    // The view models belong to one sign-in (the key holds its generation), so the next one starts fresh.
    @Composable
    private fun SignIn(dependencies: AppDependencies, key: String, showsSignedOutNotice: Boolean) {
        val viewModel = viewModel(key = "signIn-$key-${language.tag}") {
            SignInViewModel(dependencies.signInApi, dependencies.session, language.apiLocale)
        }
        val state by viewModel.state.collectAsStateWithLifecycle()
        val actions = SignInActions(
            onEmailChange = viewModel::onEmailChange,
            onSendCode = viewModel::sendCode,
            onCodeChange = viewModel::onCodeChange,
            onSubmitCode = viewModel::submitCode,
            onResend = viewModel::resendCode,
            onChangeEmail = viewModel::changeEmail,
            onRetry = viewModel::retry,
        )
        SignInScreen(state, actions, showsSignedOutNotice = showsSignedOutNotice)
    }

    @Composable
    private fun Home(dependencies: AppDependencies, key: String) {
        val hello = viewModel(key = "hello-$key-${language.tag}") {
            HelloViewModel(dependencies.helloApi, language.apiLocale)
        }
        val me = viewModel(key = "home-$key") {
            HomeViewModel(
                dependencies.meApi,
                dependencies.session,
                dependencies::signOutApi,
                onAccount = Observability::setUser,
            )
        }
        val helloState by hello.state.collectAsStateWithLifecycle()
        val meState by me.state.collectAsStateWithLifecycle()
        val signingOut by me.signingOut.collectAsStateWithLifecycle()
        HomeScreen(
            helloState,
            meState,
            signingOut,
            onRetryHello = hello::retry,
            onRetryMe = me::retry,
            onSignOut = me::signOut,
        )
    }
}

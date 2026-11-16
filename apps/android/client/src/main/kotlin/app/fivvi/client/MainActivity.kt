package app.fivvi.client

import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.os.Bundle
import android.os.LocaleList
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.fivvi.client.account.AccountViewModel
import app.fivvi.client.links.LinkScreen
import app.fivvi.client.links.LinkViewModel
import app.fivvi.client.links.OpenedLink
import app.fivvi.client.links.linkUrl
import app.fivvi.client.shell.BookTags
import app.fivvi.client.shell.ClientShell
import app.fivvi.client.shell.HomeTags
import app.fivvi.client.shell.NoWorkspaceScreen
import app.fivvi.client.shell.ProfileActions
import app.fivvi.client.shell.ProfileScreen
import app.fivvi.client.shell.Tab
import app.fivvi.client.signin.ClientSignInLogo
import app.fivvi.core.AppLanguage
import app.fivvi.core.LanguageViewModel
import app.fivvi.core.observability.Observability
import app.fivvi.core.signin.SignInActions
import app.fivvi.core.signin.SignInScreen
import app.fivvi.core.signin.SignInViewModel
import app.fivvi.core.theme.FivviTheme
import app.fivvi.core.ui.Localized
import app.fivvi.core.ui.OnForeground

class MainActivity : ComponentActivity() {
    // The join or invitation link the app was opened with (E017 #506). It waits here through the sign-in.
    private val links: LinkViewModel by viewModels()

    // The resources follow the resolved language, not Android's own match: an unsupported device language would
    // otherwise get the default (Dutch) resources. A switch while the app runs re-renders in place (see [Localized]).
    override fun attachBaseContext(newBase: Context) {
        val language = (newBase.applicationContext as ClientApplication).dependencies.languagePreference.language.value
        super.attachBaseContext(newBase)
        applyOverrideConfiguration(Configuration().apply { setLocales(LocaleList(language.locale)) })
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val dependencies = (application as ClientApplication).dependencies
        // A recreated activity (a rotation, or after the system killed the process) gets its link from the view model's
        // saved state and must not read the start intent again: that link may have been dismissed since. Only a fresh
        // start reads it.
        if (savedInstanceState == null) openLink(intent)
        setContent {
            val language by dependencies.languagePreference.language.collectAsStateWithLifecycle()
            Localized(language) {
                FivviTheme {
                    // Test tags double as resource ids, so Maestro finds them as on iOS.
                    Surface(Modifier.fillMaxSize().semantics { testTagsAsResourceId = true }) {
                        // App start: no token is the sign-in screen, with no authenticated call; a token is the tabs.
                        val auth by dependencies.session.state.collectAsStateWithLifecycle()
                        if (auth.signedIn) {
                            val link by links.link.collectAsStateWithLifecycle()
                            Tabs(dependencies, key = "${auth.generation}", link = link, onDismissLink = links::dismiss)
                        } else {
                            SignIn(dependencies, key = "${auth.generation}", language, auth.afterRejection)
                        }
                    }
                }
            }
        }
    }

    // The app is already open (singleTask) and a link is tapped: the same activity gets it.
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        // Not setIntent: the link is held by the view model, and a recreated activity must not read it again.
        openLink(intent)
    }

    private fun openLink(intent: Intent?) {
        if (intent != null) links.open(linkUrl(intent.action, intent.flags, intent.dataString))
    }

    // The view models belong to one sign-in (the key holds its generation), so the next one starts fresh. The sign-in
    // view model outlives a language switch, so the address typed stays; its email follows the language shown (AC4).
    @Composable
    private fun SignIn(
        dependencies: ClientDependencies,
        key: String,
        language: AppLanguage,
        showsSignedOutNotice: Boolean,
    ) {
        val current by rememberUpdatedState(language)
        val viewModel = viewModel(key = "signIn-$key") {
            SignInViewModel(dependencies.signInApi, dependencies.session, { current.apiLocale })
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
            language = language,
            // Signed out, the choice is kept on the device and saved on the account at sign-in (AC4, AC5).
            onChooseLanguage = dependencies.languagePreference::choose,
        )
        // The plain Fivvi day dial, named Fivvi, above the title of both steps (E020).
        SignInScreen(state, actions, showsSignedOutNotice = showsSignedOutNotice, logo = ClientSignInLogo)
    }

    // The tabs: Home · Boeken · Profiel. Until a client belongs to a workspace (F029, F032) Home and Boeken show the
    // no-workspace state.
    @Composable
    private fun Tabs(dependencies: ClientDependencies, key: String, link: OpenedLink?, onDismissLink: () -> Unit) {
        // The stored language is adopted when `GET /v1/me` answers, on opening and on foreground (F010 AC2, AC5).
        val languages = viewModel(key = "language-$key") {
            LanguageViewModel(dependencies.meApi, dependencies.languagePreference)
        }
        val account = viewModel(key = "account-$key") {
            AccountViewModel(
                dependencies.meApi,
                dependencies.session,
                dependencies::signOutApi,
                onAccount = Observability::setUser,
                onPreferredLocale = languages::onStored,
            )
        }
        val accountState by account.state.collectAsStateWithLifecycle()
        val signingOut by account.signingOut.collectAsStateWithLifecycle()
        val language by languages.language.collectAsStateWithLifecycle()
        val saveFailed by languages.saveFailed.collectAsStateWithLifecycle()
        val online by dependencies.connectivity.online.collectAsStateWithLifecycle()
        var selected by rememberSaveable { mutableStateOf(Tab.HOME) }

        // On foreground the stored language is read again (F010 AC2, with the guard of AC3) and so is the account, for the
        // team role.
        OnForeground(languages::refresh)
        OnForeground(account::refresh)

        // A join or invitation link opened the app: its screen replaces the tabs until the person goes back (F029, F032
        // give it their screens; until then it says the app opens the link soon, with a button to the browser).
        if (link != null) {
            LinkScreen(link, onOpenInBrowser = dependencies.browser::open, onBack = onDismissLink)
        } else {
            ClientShell(online, selected, onSelect = { selected = it }) { tab ->
                when (tab) {
                    Tab.HOME -> NoWorkspaceScreen(accountState, HomeTags, account::retry)

                    Tab.BOOK -> NoWorkspaceScreen(accountState, BookTags, account::retry)

                    Tab.PROFILE -> ProfileScreen(
                        accountState,
                        ProfileActions(
                            onRetry = account::retry,
                            language = language,
                            languageSaveFailed = saveFailed,
                            onChooseLanguage = languages::choose,
                            onSignOut = account::signOut,
                            signingOut = signingOut,
                        ),
                        version = BuildConfig.VERSION_NAME,
                    )
                }
            }
        }
    }
}

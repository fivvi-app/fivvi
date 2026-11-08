package app.fivvi.pro

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.res.Configuration
import android.content.res.Resources
import android.net.Uri
import android.os.Bundle
import android.os.LocaleList
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.fivvi.api.models.MeWorkspace
import app.fivvi.core.AppLanguage
import app.fivvi.core.LanguageViewModel
import app.fivvi.core.observability.Observability
import app.fivvi.core.signin.SignInActions
import app.fivvi.core.signin.SignInScreen
import app.fivvi.core.signin.SignInViewModel
import app.fivvi.core.theme.FivviTheme
import app.fivvi.core.web.SiteLinks
import app.fivvi.pro.capabilities.WorkspaceCapabilities
import app.fivvi.pro.clients.ClientsFlow
import app.fivvi.pro.hello.HelloViewModel
import app.fivvi.pro.home.HomeDestination
import app.fivvi.pro.home.HomeScreen
import app.fivvi.pro.home.HomeViewModel
import app.fivvi.pro.home.MeState
import app.fivvi.pro.home.ProfileActions
import app.fivvi.pro.home.ProfileScreen
import app.fivvi.pro.home.ProfileViewModel
import app.fivvi.pro.home.WebLinks
import java.util.UUID

class MainActivity : ComponentActivity() {
    // The resources follow the resolved language, not Android's own match: an unsupported device language would
    // otherwise get the default (Dutch) resources. A switch while the app runs re-renders in place (see [Localized]).
    override fun attachBaseContext(newBase: Context) {
        val language = (newBase.applicationContext as FivviApplication).dependencies.languagePreference.language.value
        super.attachBaseContext(newBase)
        applyOverrideConfiguration(Configuration().apply { setLocales(LocaleList(language.locale)) })
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val dependencies = (application as FivviApplication).dependencies
        setContent {
            val language by dependencies.languagePreference.language.collectAsStateWithLifecycle()
            Localized(language) {
                FivviTheme {
                    // Test tags double as resource ids, so Maestro finds them as on iOS.
                    Surface(Modifier.fillMaxSize().semantics { testTagsAsResourceId = true }) {
                        // App start: no token is the sign-in screen, with no authenticated call; a token is the home.
                        val auth by dependencies.session.state.collectAsStateWithLifecycle()
                        if (auth.signedIn) {
                            Home(dependencies, key = "${auth.generation}", language)
                        } else {
                            SignIn(dependencies, key = "${auth.generation}", language, auth.afterRejection)
                        }
                    }
                }
            }
        }
    }

    // The screens read their strings from the context that follows the language, so a switch re-renders in place:
    // no restart, and what was typed stays in the view models.
    @Composable
    private fun Localized(language: AppLanguage, content: @Composable () -> Unit) {
        val configuration = remember(language) {
            Configuration(resources.configuration).apply { setLocales(LocaleList(language.locale)) }
        }
        val localized = remember(language) {
            val resources = createConfigurationContext(configuration).resources
            object : ContextWrapper(this) {
                override fun getResources(): Resources = resources
            }
        }
        CompositionLocalProvider(
            LocalContext provides localized,
            LocalConfiguration provides configuration,
            LocalResources provides localized.resources,
            content = content,
        )
    }

    // The view models belong to one sign-in (the key holds its generation), so the next one starts fresh. The sign-in
    // view model outlives a language switch, so the address typed stays; its email follows the language shown (AC4).
    @Composable
    private fun SignIn(
        dependencies: AppDependencies,
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
        SignInScreen(state, actions, showsSignedOutNotice = showsSignedOutNotice)
    }

    // The system browser, never a web view: creating a workspace happens on the web only (F002 AC10).
    private fun openWelcomeOnTheWeb() = openOnTheWeb(WebLinks.welcomeUrl(BuildConfig.API_BASE_URL))

    private fun openOnTheWeb(url: String) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        } catch (_: ActivityNotFoundException) {
            // A phone without a browser can't open it; there is nothing else to do here.
        }
    }

    // Profiel (TM-04): opened from the home; it reads the name, the email address and the workspaces on opening and on
    // foreground (F003 AC9, F005).
    @Composable
    private fun Profile(
        dependencies: AppDependencies,
        key: String,
        opening: Int,
        languages: LanguageViewModel,
        currentWorkspace: UUID?,
        onSelectWorkspace: (UUID) -> Unit,
    ) {
        val profile = viewModel(key = "profile-$key-$opening") {
            ProfileViewModel(dependencies.meApi, dependencies.trainersApi)
        }
        val state by profile.state.collectAsStateWithLifecycle()
        val editor by profile.editor.collectAsStateWithLifecycle()
        val language by languages.language.collectAsStateWithLifecycle()
        val saveFailed by languages.saveFailed.collectAsStateWithLifecycle()
        OnForeground(profile::refresh)
        val actions = ProfileActions(
            onRetry = profile::retry,
            onEditName = profile::startEditingName,
            onNameInput = profile::onNameInput,
            onSaveName = profile::saveName,
            onCancelName = profile::cancelEditingName,
            onSetTrainsHere = profile::setTrainsHere,
            language = language,
            languageSaveFailed = saveFailed,
            onChooseLanguage = languages::choose,
            currentWorkspace = currentWorkspace,
            onSelectWorkspace = onSelectWorkspace,
            // The page of the website in the language shown (F064 AC17), in the system browser.
            onOpenSitePage = { openOnTheWeb(SiteLinks.url(it, language)) },
        )
        ProfileScreen(state, editor, actions)
    }

    // Runs [action] each time the app comes back to the foreground, not at the start that composing this already covers
    // (the observer is told the current state when it is added).
    @Composable
    private fun OnForeground(action: () -> Unit) {
        var first by remember { mutableStateOf(true) }
        LifecycleEventEffect(Lifecycle.Event.ON_START) {
            if (first) first = false else action()
        }
    }

    @Composable
    private fun Home(dependencies: AppDependencies, key: String, language: AppLanguage) {
        val hello = viewModel(key = "hello-$key-${language.tag}") {
            HelloViewModel(dependencies.helloApi, language.apiLocale)
        }
        // What the API lists per workspace (F004 AC10), the one helper that decides which actions show. `GET /v1/me` fills
        // it on opening and on foreground; *Klanten* and *+ Nieuwe klant* (F006, M4) show from it, and nothing else decides.
        val capabilities = viewModel(key = "capabilities-$key") { WorkspaceCapabilities(dependencies.meApi) }
        val languages = viewModel(key = "language-$key") {
            LanguageViewModel(dependencies.meApi, dependencies.languagePreference, capabilities::replace)
        }
        val me = viewModel(key = "home-$key") {
            HomeViewModel(
                dependencies.meApi,
                dependencies.workspacesApi,
                dependencies.session,
                dependencies.currentWorkspace,
                dependencies::signOutApi,
                onAccount = Observability::setUser,
                onPreferredLocale = languages::onStored,
                onWorkspaces = capabilities::replace,
            )
        }
        val helloState by hello.state.collectAsStateWithLifecycle()
        val meState by me.state.collectAsStateWithLifecycle()
        val signingOut by me.signingOut.collectAsStateWithLifecycle()
        var showsProfile by rememberSaveable { mutableStateOf(false) }
        var showsClients by rememberSaveable { mutableStateOf(false) }
        val shown = (meState as? MeState.Loaded)?.destination as? HomeDestination.Workspace
        val allowed by capabilities.capabilities.collectAsStateWithLifecycle()
        // Klanten (TM-02) of the workspace shown: only while the API lists `clients.view` there (F004 AC10).
        val mayViewClients = shown != null && allowed.mayShow(shown.id, MeWorkspace.Capabilities.CLIENTS_PERIOD_VIEW)
        // Each opening of Profiel gets a new view model, so it reads the list again (F003 AC9).
        var profileOpenings by rememberSaveable { mutableIntStateOf(0) }

        // On foreground: is the workspace shown still the person's (F003 AC6)?
        OnForeground(me::refresh)
        // On foreground the stored language is read again: a change made elsewhere is adopted (F010 AC2).
        OnForeground(languages::refresh)

        if (showsClients && shown != null) {
            ClientsFlow(
                dependencies.clientsApi,
                dependencies.workspacesApi,
                capabilities,
                shown.id,
                shown.name,
                sessionKey = key,
                onClose = { showsClients = false },
            )
            return
        }
        if (showsProfile) {
            BackHandler { showsProfile = false }
            Profile(
                dependencies,
                key,
                profileOpenings,
                languages,
                currentWorkspace = shown?.id,
                // A tap on another workspace switches to it; either way the app is back on the first tab (F012 AC6).
                onSelectWorkspace = { id ->
                    showsProfile = false
                    showsClients = false
                    me.switchWorkspace(id)
                },
            )
            return
        }
        HomeScreen(
            helloState,
            meState,
            signingOut,
            onRetryHello = hello::retry,
            onRetryMe = me::retry,
            onSignOut = me::signOut,
            onOpenWeb = ::openWelcomeOnTheWeb,
            onOpenProfile = {
                profileOpenings++
                showsProfile = true
            },
            onOpenClients = if (mayViewClients) ({ showsClients = true }) else null,
        )
    }
}

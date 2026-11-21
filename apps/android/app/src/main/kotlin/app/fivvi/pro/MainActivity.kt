package app.fivvi.pro

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.fivvi.api.models.MeWorkspace
import app.fivvi.core.AppLanguage
import app.fivvi.core.LanguageViewModel
import app.fivvi.core.R as CoreR
import app.fivvi.core.observability.Observability
import app.fivvi.core.signin.SignInActions
import app.fivvi.core.signin.SignInLogo
import app.fivvi.core.signin.SignInScreen
import app.fivvi.core.signin.SignInViewModel
import app.fivvi.core.theme.FivviTheme
import app.fivvi.core.ui.Localized
import app.fivvi.core.ui.OnForeground
import app.fivvi.core.web.SiteLinks
import app.fivvi.pro.capabilities.WorkspaceCapabilities
import app.fivvi.pro.classes.ClassApis
import app.fivvi.pro.classes.ClassDateFlow
import app.fivvi.pro.classes.NewGroupClassFlow
import app.fivvi.pro.clients.ClientsFlow
import app.fivvi.pro.home.HomeDestination
import app.fivvi.pro.home.HomeScreen
import app.fivvi.pro.home.HomeViewModel
import app.fivvi.pro.home.MeState
import app.fivvi.pro.home.NewMenuOptions
import app.fivvi.pro.home.ProfileActions
import app.fivvi.pro.home.ProfileScreen
import app.fivvi.pro.home.ProfileViewModel
import app.fivvi.pro.home.WebLinks
import app.fivvi.pro.sessions.NewSessionFlow
import app.fivvi.pro.sessions.SessionApis
import app.fivvi.pro.sessions.SessionFlow
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
                            Home(dependencies, key = "${auth.generation}")
                        } else {
                            SignIn(dependencies, key = "${auth.generation}", language, auth.afterRejection)
                        }
                    }
                }
            }
        }
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
        SignInScreen(
            state,
            actions,
            showsSignedOutNotice = showsSignedOutNotice,
            // The Fivvi Pro day dial, light in light mode and dark in dark mode, in place of a letter mark (E020).
            logo = SignInLogo(R.drawable.fivvi_pro_dial_light, R.drawable.fivvi_pro_dial_dark, CoreR.string.app_name),
        )
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

    @Composable
    private fun Home(dependencies: AppDependencies, key: String) {
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
        val meState by me.state.collectAsStateWithLifecycle()
        val accountName by me.accountName.collectAsStateWithLifecycle()
        val signingOut by me.signingOut.collectAsStateWithLifecycle()
        var showsProfile by rememberSaveable { mutableStateOf(false) }
        // The screens above the home, the last one shown: *Klanten*, PS-04, a session's screen (TD-02) and a client's
        // profile opened from it (F020), TD-05 and a class on a date (TD-03, F021). System back pops one.
        var stack by rememberSaveable { mutableStateOf("") }
        val routes = Routes.of(stack)
        val screens = rememberSaveableStateHolder()
        val shown = (meState as? MeState.Loaded)?.destination as? HomeDestination.Workspace
        val allowed by capabilities.capabilities.collectAsStateWithLifecycle()
        // Klanten (TM-02) of the workspace shown: only while the API lists `clients.view` there (F004 AC10).
        val mayViewClients = shown != null && allowed.mayShow(shown.id, MeWorkspace.Capabilities.CLIENTS_PERIOD_VIEW)
        // The **+** shows *Privésessie* for whoever the API lists `session.private.manage.own` or `.any` for there (F020)
        // and *Groepsles* for whoever it lists `class.manage` (F021); nothing else decides.
        val newMenu = shown?.let { workspace -> NewMenuOptions.of { allowed.mayShow(workspace.id, it) } }
        // Each opening of Profiel gets a new view model, so it reads the list again (F003 AC9).
        var profileOpenings by rememberSaveable { mutableIntStateOf(0) }
        // Each opening of PS-04 starts with an empty form.
        var newSessionOpenings by rememberSaveable { mutableIntStateOf(0) }
        // Each opening of TD-05 starts with an empty form, and each opening of a class date reads it again.
        var newClassOpenings by rememberSaveable { mutableIntStateOf(0) }
        var classDateOpenings by rememberSaveable { mutableIntStateOf(0) }
        // Each opening of a session's screen reads the session again and shows no "moved" message of an earlier one.
        var sessionOpenings by rememberSaveable { mutableIntStateOf(0) }
        fun openSession(id: UUID, replacing: Boolean = false) {
            sessionOpenings++
            stack = Routes.push(if (replacing) Routes.pop(stack) else stack, Routes.session(id))
        }

        // On foreground: is the workspace shown still the person's (F003 AC6)?
        OnForeground(me::refresh)
        // On foreground the stored language is read again: a change made elsewhere is adopted (F010 AC2).
        OnForeground(languages::refresh)

        fun openClassDate(id: UUID, added: Int?, replacing: Boolean = false) {
            classDateOpenings++
            stack = Routes.push(if (replacing) Routes.pop(stack) else stack, Routes.classDate(id, added))
        }

        val route = routes.lastOrNull()
        val email = (meState as? MeState.Loaded)?.email.orEmpty()
        val apis = SessionApis(
            dependencies.sessionsApi,
            dependencies.locationsApi,
            dependencies.trainersApi,
            dependencies.workspacesApi,
            dependencies.clientsApi,
        )
        val classApis = ClassApis(
            dependencies.groupClassesApi,
            dependencies.sessionsApi,
            dependencies.locationsApi,
            dependencies.trainersApi,
            dependencies.workspacesApi,
        )
        if (route != null && shown != null) {
            // Each opening of PS-04 has state of its own: nothing of an earlier form comes back.
            val screenKey = when {
                route == Routes.NEW_SESSION -> "$route-$newSessionOpenings"
                route == Routes.NEW_CLASS -> "$route-$newClassOpenings"
                Routes.classDateOf(route) != null -> "$route-$classDateOpenings"
                Routes.sessionId(route) != null -> "$route-$sessionOpenings"
                else -> route
            }
            screens.SaveableStateProvider(screenKey) {
                when {
                    route == Routes.CLIENTS -> ClientsFlow(
                        dependencies.clientsApi,
                        dependencies.workspacesApi,
                        capabilities,
                        shown.id,
                        shown.name,
                        sessionKey = key,
                        onClose = { stack = Routes.pop(stack) },
                        sessionsApi = dependencies.sessionsApi,
                        onOpenSession = ::openSession,
                    )

                    route == Routes.NEW_SESSION -> NewSessionFlow(
                        apis,
                        capabilities,
                        shown.id,
                        shown.name,
                        forAnyTrainer = allowed.mayShow(
                            shown.id,
                            MeWorkspace.Capabilities.SESSION_PERIOD_PRIVATE_PERIOD_MANAGE_PERIOD_ANY,
                        ),
                        mayAddClients = allowed.mayShow(shown.id, MeWorkspace.Capabilities.CLIENTS_PERIOD_MANAGE),
                        teamMemberId = shown.teamMemberId,
                        email = email,
                        accountName = accountName,
                        sessionKey = key,
                        opening = newSessionOpenings,
                        onClose = { stack = Routes.pop(stack) },
                        // Saved: the session's screen replaces the form, so back from it is the home.
                        onSaved = { openSession(it, replacing = true) },
                    )

                    route == Routes.NEW_CLASS -> NewGroupClassFlow(
                        classApis,
                        capabilities,
                        shown.id,
                        shown.name,
                        teamMemberId = shown.teamMemberId,
                        email = email,
                        accountName = accountName,
                        sessionKey = key,
                        opening = newClassOpenings,
                        onClose = { stack = Routes.pop(stack) },
                        // Saved: TD-03 of the new date replaces the form, so back from it is the home.
                        onSaved = { id, datesAdded -> openClassDate(id, added = datesAdded, replacing = true) },
                    )

                    Routes.classDateOf(route) != null -> ClassDateFlow(
                        classApis,
                        capabilities,
                        shown.id,
                        shown.name,
                        Routes.classDateOf(route)!!.first,
                        teamMemberId = shown.teamMemberId,
                        added = Routes.classDateOf(route)!!.second,
                        sessionKey = key,
                        opening = classDateOpenings,
                        onBack = { stack = Routes.pop(stack) },
                    )

                    Routes.sessionId(route) != null -> SessionFlow(
                        apis,
                        capabilities,
                        shown.id,
                        shown.name,
                        Routes.sessionId(route)!!,
                        teamMemberId = shown.teamMemberId,
                        sessionKey = key,
                        opening = sessionOpenings,
                        onBack = { stack = Routes.pop(stack) },
                        onOpenClient = { stack = Routes.push(stack, Routes.client(it)) },
                        onRoute = ::openOnTheWeb,
                    )

                    Routes.clientId(route) != null -> ClientsFlow(
                        dependencies.clientsApi,
                        dependencies.workspacesApi,
                        capabilities,
                        shown.id,
                        shown.name,
                        sessionKey = key,
                        onClose = { stack = Routes.pop(stack) },
                        sessionsApi = dependencies.sessionsApi,
                        onOpenSession = ::openSession,
                        openClient = Routes.clientId(route),
                    )
                }
            }
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
                    stack = ""
                    me.switchWorkspace(id)
                },
            )
            return
        }
        HomeScreen(
            meState,
            signingOut,
            onRetryMe = me::retry,
            onSignOut = me::signOut,
            onOpenWeb = ::openWelcomeOnTheWeb,
            onOpenProfile = {
                profileOpenings++
                showsProfile = true
            },
            onOpenClients = if (mayViewClients) ({ stack = Routes.push(stack, Routes.CLIENTS) }) else null,
            onNewPrivateSession = if (newMenu?.showsPrivateSession == true) {
                {
                    newSessionOpenings++
                    stack = Routes.push(stack, Routes.NEW_SESSION)
                }
            } else {
                null
            },
            onNewGroupClass = if (newMenu?.showsGroupClass == true) {
                {
                    newClassOpenings++
                    stack = Routes.push(stack, Routes.NEW_CLASS)
                }
            } else {
                null
            },
            groupClassNoteWorkspace = shown?.name.takeIf { newMenu?.showsGroupClassNote == true },
        )
    }
}

/**
 * The screens above the home, as one string kept across a rotation: the routes joined by a comma, the last one shown. A
 * route is `clients`, `newSession`, `session/<id>` or `client/<id>` (F020), `newClass`, `classDate/<id>` or, for the date
 * TD-05 has just created, `classDateNew/<dates added>/<id>` (F021, F022).
 */
internal object Routes {
    const val CLIENTS = "clients"
    const val NEW_SESSION = "newSession"
    const val NEW_CLASS = "newClass"
    private const val SESSION = "session/"
    private const val CLIENT = "client/"
    private const val CLASS_DATE = "classDate/"
    private const val CLASS_DATE_ADDED = "classDateNew/"

    fun of(stack: String): List<String> = stack.split(",").filter { it.isNotEmpty() }

    fun push(stack: String, route: String) = (of(stack) + route).joinToString(",")

    fun pop(stack: String) = of(stack).dropLast(1).joinToString(",")

    fun session(id: UUID) = "$SESSION$id"

    fun client(id: UUID) = "$CLIENT$id"

    /**
     * A class on a date (TD-03); [added] is the number of dates TD-05 has just created for it ("Groepsles toegevoegd", or
     * "12 groepslessen toegevoegd" for a weekly class), `null` for a date opened from the calendar.
     */
    fun classDate(id: UUID, added: Int?) = if (added != null) "$CLASS_DATE_ADDED$added/$id" else "$CLASS_DATE$id"

    /** The date's ID of a class date route and how many dates were just added, or `null` for any other route. */
    fun classDateOf(route: String): Pair<UUID, Int?>? = when {
        route.startsWith(CLASS_DATE_ADDED) -> route.removePrefix(CLASS_DATE_ADDED).split("/", limit = 2).let {
            UUID.fromString(it[1]) to it[0].toInt()
        }

        route.startsWith(CLASS_DATE) -> UUID.fromString(route.removePrefix(CLASS_DATE)) to null

        else -> null
    }

    fun sessionId(route: String): UUID? = route.removePrefix(SESSION).takeIf {
        route.startsWith(SESSION)
    }?.let(UUID::fromString)

    fun clientId(route: String): UUID? = route.removePrefix(CLIENT).takeIf {
        route.startsWith(CLIENT)
    }?.let(UUID::fromString)
}

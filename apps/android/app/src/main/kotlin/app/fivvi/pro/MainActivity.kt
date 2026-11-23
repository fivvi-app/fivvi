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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
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
import app.fivvi.pro.home.NewMenu
import app.fivvi.pro.home.NewMenuOptions
import app.fivvi.pro.home.ProfileActions
import app.fivvi.pro.home.ProfileScreen
import app.fivvi.pro.home.ProfileViewModel
import app.fivvi.pro.home.WebLinks
import app.fivvi.pro.home.WorkspacesRead
import app.fivvi.pro.personal.CalendarPlaceholder
import app.fivvi.pro.personal.PersonalCache
import app.fivvi.pro.personal.PersonalDestinationViewModel
import app.fivvi.pro.personal.PersonalRoute
import app.fivvi.pro.personal.PersonalRows
import app.fivvi.pro.personal.PersonalUnavailable
import app.fivvi.pro.personal.ProTab
import app.fivvi.pro.personal.ProTabs
import app.fivvi.pro.personal.StudioDayViewModel
import app.fivvi.pro.personal.StudioWorkspace
import app.fivvi.pro.personal.TodayTab
import app.fivvi.pro.personal.TodayViewModel
import app.fivvi.pro.sessions.NewSessionFlow
import app.fivvi.pro.sessions.SessionApis
import app.fivvi.pro.sessions.SessionFlow
import java.time.Instant
import java.time.OffsetDateTime
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

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
        // What Vandaag kept on the phone belongs to a sign-in: with none, it is not there (F013 AC7).
        LaunchedEffect(Unit) { withContext(Dispatchers.IO) { dependencies.personalStore.clear() } }
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
        // Vandaag (F013): the day across the workspaces. It asks the account again on a pull, so a workspace the person lost
        // shows its notice, and an answer that comes after the sign-out is dropped.
        val today = viewModel(key = "today-$key") {
            TodayViewModel(
                dependencies.meApi,
                dependencies.personalStore,
                dependencies.clock::instant,
                refreshAccount = {
                    (me.refreshWorkspaces() as? WorkspacesRead.Listed)?.workspaces?.map {
                        PersonalCache.Workspace(it.id, it.name)
                    }
                },
                stillSignedIn = { dependencies.session.state.value.let { it.signedIn && "${it.generation}" == key } },
            )
        }
        // The Owner's *Mijn dag | Hele studio* (F014): the workspace's day, for a workspace with a team. A 403 of the day tells the
        // capability helper, which hides the control and reads the account again.
        val studio = viewModel(key = "studio-$key") {
            StudioDayViewModel(
                dependencies.workspacesApi,
                dependencies.trainersApi,
                dependencies.clock::instant,
                onForbidden = { capabilities.forbidden(it, MeWorkspace.Capabilities.CALENDAR_PERIOD_MANAGE) },
            )
        }
        val meState by me.state.collectAsStateWithLifecycle()
        val accountName by me.accountName.collectAsStateWithLifecycle()
        val signingOut by me.signingOut.collectAsStateWithLifecycle()
        val listed by me.workspaces.collectAsStateWithLifecycle()
        // The workspaces the account lists now: one the phone knew and the list lacks shows its notice on Vandaag, once.
        LaunchedEffect(listed) {
            listed?.let { all -> today.workspacesListed(all.map { PersonalCache.Workspace(it.id, it.name) }) }
        }
        var tab by rememberSaveable { mutableStateOf(dependencies.initialTab) }
        var showsProfile by rememberSaveable { mutableStateOf(false) }
        // The screens above the tabs, the last one shown: *Klanten*, PS-04, a session's screen (TD-02) and a client's
        // profile opened from it (F020), TD-05 and a class on a date (TD-03, F021). System back pops one.
        var stack by rememberSaveable { mutableStateOf("") }
        val routes = Routes.of(stack)
        val screens = rememberSaveableStateHolder()
        val shown = (meState as? MeState.Loaded)?.destination as? HomeDestination.Workspace
        val allowed by capabilities.capabilities.collectAsStateWithLifecycle()
        // *Mijn dag | Hele studio* follows the workspace shown and what the API lists for the person there.
        val mayManageCalendar =
            shown != null && allowed.mayShow(shown.id, MeWorkspace.Capabilities.CALENDAR_PERIOD_MANAGE)
        LaunchedEffect(shown?.id, mayManageCalendar) { studio.configure(shown?.id, mayManageCalendar) }
        val studioWorkspace = shown?.let { workspace ->
            listed?.firstOrNull { it.id == workspace.id }?.let {
                StudioWorkspace(workspace.id, workspace.name, workspace.teamMemberId, it.trainerWord)
            }
        }
        // Klanten (TM-02) of the workspace shown: only while the API lists `clients.view` there (F004 AC10).
        val mayViewClients = shown != null && allowed.mayShow(shown.id, MeWorkspace.Capabilities.CLIENTS_PERIOD_VIEW)
        // The **+** shows *Privésessie* for whoever the API lists `session.private.manage.own` or `.any` for there (F020)
        // and *Groepsles* for whoever it lists `class.manage` (F021); nothing else decides.
        val newMenu = shown?.let { workspace -> NewMenuOptions.of { allowed.mayShow(workspace.id, it) } }
        // Each opening of Profiel gets a new view model, so it reads the list again (F003 AC9).
        var profileOpenings by rememberSaveable { mutableIntStateOf(0) }
        // Each opening of PS-04 starts with an empty form.
        var newSessionOpenings by rememberSaveable { mutableIntStateOf(0) }
        // The start *Plannen* on Vandaag gives PS-04 (epoch milliseconds), none for the **+**.
        var planStart by rememberSaveable { mutableStateOf<Long?>(null) }
        // Each opening of TD-05 starts with an empty form, and each opening of a class date reads it again.
        var newClassOpenings by rememberSaveable { mutableIntStateOf(0) }
        var classDateOpenings by rememberSaveable { mutableIntStateOf(0) }
        // Each opening of a session's screen reads the session again and shows no "moved" message of an earlier one.
        var sessionOpenings by rememberSaveable { mutableIntStateOf(0) }
        val route = routes.lastOrNull()
        // A screen Vandaag opened is in the workspace of its item, and so is every screen it opens (F013 AC4).
        val scope = route?.let(Routes::workspaceOf)

        fun scoped(next: String) = scope?.let { Routes.inWorkspace(it, next) } ?: next

        fun openSession(id: UUID, replacing: Boolean = false) {
            sessionOpenings++
            stack = Routes.push(if (replacing) Routes.pop(stack) else stack, scoped(Routes.session(id)))
        }

        // On foreground: is the workspace shown still the person's (F003 AC6)?
        OnForeground(me::refresh)
        // On foreground the stored language is read again: a change made elsewhere is adopted (F010 AC2).
        OnForeground(languages::refresh)

        fun openClassDate(id: UUID, added: Int?, replacing: Boolean = false) {
            classDateOpenings++
            stack = Routes.push(if (replacing) Routes.pop(stack) else stack, scoped(Routes.classDate(id, added)))
        }

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
        // The workspace a screen above the tabs is in: the one shown, or the item's of a screen Vandaag opened.
        val target = if (scope == null) {
            shown
        } else {
            listed.orEmpty().firstOrNull {
                it.id == scope
            }?.let { HomeDestination.Workspace(it.name, it.id, it.teamMemberId) }
        }
        if (route != null && scope != null && target == null) {
            // The item's workspace can't be read: the person is not on it any more, or the account isn't there yet.
            val destination = viewModel(key = "personal-$key-$route") {
                PersonalDestinationViewModel(scope, { me.workspaces.value.orEmpty() }, me::refreshWorkspaces)
            }
            val read by destination.state.collectAsStateWithLifecycle()
            BackHandler { stack = Routes.pop(stack) }
            PersonalUnavailable(read, onRetry = destination::retry, onBack = { stack = Routes.pop(stack) })
            return
        }
        if (route != null && target != null) {
            val plain = Routes.unscoped(route)
            // Each opening of PS-04 has state of its own: nothing of an earlier form comes back.
            val screenKey = when {
                plain == Routes.NEW_SESSION -> "$route-$newSessionOpenings"
                plain == Routes.NEW_CLASS -> "$route-$newClassOpenings"
                Routes.classDateOf(plain) != null -> "$route-$classDateOpenings"
                Routes.sessionId(plain) != null -> "$route-$sessionOpenings"
                else -> route
            }
            screens.SaveableStateProvider(screenKey) {
                when {
                    plain == Routes.CLIENTS -> ClientsFlow(
                        dependencies.clientsApi,
                        dependencies.workspacesApi,
                        capabilities,
                        target.id,
                        target.name,
                        sessionKey = key,
                        onClose = { stack = Routes.pop(stack) },
                        sessionsApi = dependencies.sessionsApi,
                        onOpenSession = ::openSession,
                    )

                    plain == Routes.NEW_SESSION -> NewSessionFlow(
                        apis,
                        capabilities,
                        target.id,
                        target.name,
                        forAnyTrainer = allowed.mayShow(
                            target.id,
                            MeWorkspace.Capabilities.SESSION_PERIOD_PRIVATE_PERIOD_MANAGE_PERIOD_ANY,
                        ),
                        mayAddClients = allowed.mayShow(target.id, MeWorkspace.Capabilities.CLIENTS_PERIOD_MANAGE),
                        teamMemberId = target.teamMemberId,
                        email = email,
                        accountName = accountName,
                        sessionKey = key,
                        opening = newSessionOpenings,
                        onClose = { stack = Routes.pop(stack) },
                        // Saved: the session's screen replaces the form, so back from it is the screen it was opened from.
                        onSaved = { openSession(it, replacing = true) },
                        start = planStart?.let {
                            OffsetDateTime.ofInstant(Instant.ofEpochMilli(it), PersonalRows.TIME_ZONE)
                        },
                    )

                    plain == Routes.NEW_CLASS -> NewGroupClassFlow(
                        classApis,
                        capabilities,
                        target.id,
                        target.name,
                        teamMemberId = target.teamMemberId,
                        email = email,
                        accountName = accountName,
                        sessionKey = key,
                        opening = newClassOpenings,
                        onClose = { stack = Routes.pop(stack) },
                        // Saved: TD-03 of the new date replaces the form, so back from it is the screen it was opened from.
                        onSaved = { id, datesAdded -> openClassDate(id, added = datesAdded, replacing = true) },
                    )

                    Routes.classDateOf(plain) != null -> ClassDateFlow(
                        classApis,
                        capabilities,
                        target.id,
                        target.name,
                        Routes.classDateOf(plain)!!.first,
                        teamMemberId = target.teamMemberId,
                        added = Routes.classDateOf(plain)!!.second,
                        sessionKey = key,
                        opening = classDateOpenings,
                        onBack = { stack = Routes.pop(stack) },
                    )

                    Routes.sessionId(plain) != null -> SessionFlow(
                        apis,
                        capabilities,
                        target.id,
                        target.name,
                        Routes.sessionId(plain)!!,
                        teamMemberId = target.teamMemberId,
                        sessionKey = key,
                        opening = sessionOpenings,
                        onBack = { stack = Routes.pop(stack) },
                        onOpenClient = { stack = Routes.push(stack, scoped(Routes.client(it))) },
                        onRoute = ::openOnTheWeb,
                    )

                    Routes.clientId(plain) != null -> ClientsFlow(
                        dependencies.clientsApi,
                        dependencies.workspacesApi,
                        capabilities,
                        target.id,
                        target.name,
                        sessionKey = key,
                        onClose = { stack = Routes.pop(stack) },
                        sessionsApi = dependencies.sessionsApi,
                        onOpenSession = ::openSession,
                        openClient = Routes.clientId(plain),
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
                // A tap on another workspace switches to it; either way the app is back on the tab Profiel was opened from
                // (the home, F012 AC6).
                onSelectWorkspace = { id ->
                    showsProfile = false
                    stack = ""
                    me.switchWorkspace(id)
                },
            )
            return
        }
        val onNewPrivateSession: (() -> Unit)? = if (newMenu?.showsPrivateSession == true) {
            {
                newSessionOpenings++
                planStart = null
                stack = Routes.push(stack, Routes.NEW_SESSION)
            }
        } else {
            null
        }
        val onNewGroupClass: (() -> Unit)? = if (newMenu?.showsGroupClass == true) {
            {
                newClassOpenings++
                stack = Routes.push(stack, Routes.NEW_CLASS)
            }
        } else {
            null
        }
        val groupClassNoteWorkspace = shown?.name.takeIf { newMenu?.showsGroupClassNote == true }
        ProTabs(selected = tab, onSelect = { tab = it }) { selected ->
            when (selected) {
                ProTab.TODAY -> TodayTab(
                    today,
                    studio,
                    studioWorkspace,
                    // A row opens TD-02 or TD-03 in the workspace of its item, whichever is the current one (F013 AC4).
                    onOpen = { row ->
                        if (row.isGroup) classDateOpenings++ else sessionOpenings++
                        stack = Routes.push(stack, PersonalRoute.of(row))
                    },
                    onRoute = ::openOnTheWeb,
                    // *Plannen* opens PS-04 of the current workspace at the start of the gap, for whoever may plan there.
                    onPlan = onNewPrivateSession?.let {
                        { start ->
                            it()
                            planStart = start.toInstant().toEpochMilli()
                        }
                    },
                    // The Agenda tab on tomorrow comes with TD-04 (#527); until then it opens its placeholder.
                    onOpenTomorrow = { tab = ProTab.CALENDAR },
                    // Creating needs the server: offline the + is off, and says why (as *Plannen* does).
                    menu = { offline ->
                        if ((onNewPrivateSession != null || onNewGroupClass != null) && meState is MeState.Loaded) {
                            NewMenu(
                                onNewPrivateSession,
                                onNewGroupClass,
                                groupClassNoteWorkspace,
                                Modifier,
                                enabled = !offline,
                                disabledReason = if (offline) stringResource(CoreR.string.common_offline) else null,
                            )
                        }
                    },
                )

                ProTab.CALENDAR -> CalendarPlaceholder()

                ProTab.HOME -> HomeScreen(
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
                    onNewPrivateSession = onNewPrivateSession,
                    onNewGroupClass = onNewGroupClass,
                    groupClassNoteWorkspace = groupClassNoteWorkspace,
                )
            }
        }
    }
}

/**
 * The screens above the tabs, as one string kept across a rotation: the routes joined by a comma, the last one shown. A
 * route is `clients`, `newSession`, `session/<id>` or `client/<id>` (F020), `newClass`, `classDate/<id>` or, for the date
 * TD-05 has just created, `classDateNew/<dates added>/<id>` (F021, F022). A route Vandaag opens is written
 * `@<workspace ID>:<route>` (F013): the screen is in the workspace of the item, whichever is the current one.
 */
internal object Routes {
    const val CLIENTS = "clients"
    const val NEW_SESSION = "newSession"
    const val NEW_CLASS = "newClass"
    private const val SESSION = "session/"
    private const val CLIENT = "client/"
    private const val CLASS_DATE = "classDate/"
    private const val CLASS_DATE_ADDED = "classDateNew/"
    private const val IN_WORKSPACE = "@"
    private const val IN_WORKSPACE_END = ":"

    fun of(stack: String): List<String> = stack.split(",").filter { it.isNotEmpty() }

    fun push(stack: String, route: String) = (of(stack) + route).joinToString(",")

    fun pop(stack: String) = of(stack).dropLast(1).joinToString(",")

    fun session(id: UUID) = "$SESSION$id"

    /**
     * [route] in the workspace [workspaceId] (F013): what Vandaag opens, in the workspace of the item, whichever is the current
     * one. Every route another screen pushes from there stays in that workspace.
     */
    fun inWorkspace(workspaceId: UUID, route: String) = "$IN_WORKSPACE$workspaceId$IN_WORKSPACE_END$route"

    /** The workspace a route is opened in, or `null` for a route of the current workspace. */
    fun workspaceOf(route: String): UUID? = if (route.startsWith(IN_WORKSPACE)) {
        UUID.fromString(route.substring(IN_WORKSPACE.length, route.indexOf(IN_WORKSPACE_END)))
    } else {
        null
    }

    /** The route without the workspace it is opened in. */
    fun unscoped(route: String) = if (route.startsWith(IN_WORKSPACE)) route.substringAfter(IN_WORKSPACE_END) else route

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

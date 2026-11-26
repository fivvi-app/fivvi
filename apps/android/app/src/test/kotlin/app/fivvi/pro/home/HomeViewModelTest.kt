package app.fivvi.pro.home

import app.fivvi.api.models.MeResponse
import app.fivvi.api.models.MeWorkspace
import app.fivvi.api.models.TrainerWord
import app.fivvi.core.auth.AuthState
import app.fivvi.core.auth.InMemorySessionStore
import app.fivvi.core.auth.Session
import app.fivvi.core.me.FakeMeApi
import app.fivvi.core.me.teamMemberIdOf
import app.fivvi.core.me.workspaceIdOf
import app.fivvi.core.net.FakeConnectivity
import app.fivvi.core.quarantine.Isolation
import app.fivvi.core.signin.FakeSignInApi
import app.fivvi.pro.attendance.AttendanceQueue
import app.fivvi.pro.attendance.AttendanceStatus
import app.fivvi.pro.attendance.FakeAttendance
import app.fivvi.pro.attendance.FakeAttendanceServer
import app.fivvi.pro.attendance.QueueAction
import app.fivvi.pro.attendance.participantIdOf
import app.fivvi.pro.personal.MemoryPersonalStore
import app.fivvi.pro.sessions.FakeSessionsApi
import app.fivvi.pro.workspace.CurrentWorkspace
import app.fivvi.pro.workspace.InMemoryLastWorkspaceStore
import java.io.IOException
import java.time.Instant
import java.util.UUID
import kotlin.time.Duration.Companion.seconds
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.TestCoroutineScheduler
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlinx.serialization.SerializationException
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import retrofit2.Response

// Synthetic ID (AGENTS.md, D8).
private val ACCOUNT_ID = UUID.fromString("0b9c4f2e-5d6a-4c1b-9e8f-1a2b3c4d5e6f")

/** What `GET /v1/me` answers for the account: no workspace yet (the app's workspace states come with F002). */
private fun ownerAccount() = MeResponse(
    id = ACCOUNT_ID,
    email = "owner@example.com",
    name = "Owner",
    preferredLocale = MeResponse.PreferredLocale.NL_NL,
    bookingEmails = true,
    canCreateWorkspace = false,
    workspaces = emptyList(),
    clientWorkspaces = emptyList(),
)

private val OWNER_IN_WORKSPACE = MeState.Loaded(
    "owner@example.com",
    HomeDestination.Workspace(
        "John's Gym",
        workspaceIdOf("John's Gym"),
        teamMemberIdOf("John's Gym"),
        TrainerWord.TRAINER,
    ),
)

@OptIn(ExperimentalCoroutinesApi::class)
class HomeViewModelTest {
    private val api = FakeMeApi()
    private val workspaces = FakeWorkspacesApi()
    private val signInApi = FakeSignInApi()
    private val connectivity = FakeConnectivity()
    private val store = InMemorySessionStore("tok-1")
    private val lastWorkspace = InMemoryLastWorkspaceStore()
    private var current = CurrentWorkspace(lastWorkspace)

    // The device remembered [id] before the app started.
    private fun rememberedBeforeStart(id: UUID) {
        lastWorkspace.id = id
        current = CurrentWorkspace(lastWorkspace)
    }
    private val session = Session(store, onSignedOut = { clears++ })

    // The clock of the sign-out's wait: the test dispatcher's virtual time.
    private val scheduler = TestCoroutineScheduler()
    private val dispatcher = UnconfinedTestDispatcher(scheduler)

    // The token each sign-out call was made with.
    private val signOutTokens = mutableListOf<String>()

    // The account IDs the screen passed on for error reporting, and the sign-outs the session reported.
    private val identified = mutableListOf<String>()
    private var clears = 0

    // The workspaces the screen passed on to the capabilities helper (F004 AC10).
    private val listed = mutableListOf<List<MeWorkspace>>()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun viewModel() = HomeViewModel(
        api,
        workspaces,
        session,
        current,
        connectivity,
        signOutApi = { token ->
            signOutTokens += token
            signInApi
        },
        onAccount = { identified += it },
        io = dispatcher,
        onWorkspaces = { listed += it },
    )

    @Test
    fun F001N_AC4_showsTheAccountsAddress() {
        api.answerAccount("owner@example.com")

        val viewModel = viewModel()

        assertEquals(OWNER_IN_WORKSPACE, viewModel.state.value)
        assertEquals(1, api.calls)
    }

    // F002 AC10: the API decides (workspaces, canCreateWorkspace of GET /v1/me); the app only maps the answer. The
    // texts of each state, in both locales, are checked in HomeScreenTest.
    @Test
    fun test_F002_AC10_homeStateFromMe() {
        api.answerAccount(workspaces = listOf("John's Gym"), canCreateWorkspace = false)
        api.answerAccount(workspaces = emptyList(), canCreateWorkspace = true)
        api.answerAccount(workspaces = emptyList(), canCreateWorkspace = false)
        val viewModel = viewModel()
        assertEquals(
            HomeDestination.Workspace(
                "John's Gym",
                workspaceIdOf("John's Gym"),
                teamMemberIdOf("John's Gym"),
                TrainerWord.TRAINER,
            ),
            (viewModel.state.value as MeState.Loaded).destination,
        )

        viewModel.retry()
        assertEquals(HomeDestination.SetUpOnWeb, (viewModel.state.value as MeState.Loaded).destination)

        viewModel.retry()
        assertEquals(HomeDestination.NoAccess, (viewModel.state.value as MeState.Loaded).destination)
    }

    @Test
    fun test_F002_AC10_aWorkspaceWinsOverTheRightToCreateOne() {
        api.answerAccount(workspaces = listOf("John's Gym", "Other"), canCreateWorkspace = true)

        assertEquals(
            HomeDestination.Workspace(
                "John's Gym",
                workspaceIdOf("John's Gym"),
                teamMemberIdOf("John's Gym"),
                TrainerWord.TRAINER,
            ),
            (viewModel().state.value as MeState.Loaded).destination,
        )
    }

    // F003 AC6: Sarah was removed from John's Gym while the app was in the background. The next request for the workspace
    // it shows answers 404; the app asks /me again and shows what is left, without a sign-out and without a crash.
    @Test
    fun test_F003_AC6_workspaceGoneShowsNoAccess() {
        api.answerAccount(workspaces = listOf("John's Gym"))
        api.answerAccount(workspaces = emptyList(), canCreateWorkspace = false)
        workspaces.answerGone()
        val viewModel = viewModel()

        viewModel.refresh()

        assertEquals(listOf(workspaceIdOf("John's Gym")), workspaces.requested)
        assertEquals(HomeDestination.NoAccess, (viewModel.state.value as MeState.Loaded).destination)
        assertEquals(true, session.state.value.signedIn)
        assertEquals(0, clears)
    }

    @Test
    fun test_F003_AC6_workspaceGoneShowsTheOtherWorkspace() {
        api.answerAccount(workspaces = listOf("John's Gym", "Sarah Personal Training"))
        api.answerAccount(workspaces = listOf("Sarah Personal Training"))
        workspaces.answerGone()
        val viewModel = viewModel()

        viewModel.refresh()

        assertEquals(
            HomeDestination.Workspace(
                "Sarah Personal Training",
                workspaceIdOf("Sarah Personal Training"),
                teamMemberIdOf("Sarah Personal Training"),
                TrainerWord.TRAINER,
            ),
            (viewModel.state.value as MeState.Loaded).destination,
        )
    }

    @Test
    fun test_F003_AC6_aWorkspaceThatIsStillThereChangesNothing() {
        api.answerAccount(workspaces = listOf("John's Gym"))
        workspaces.answerFound()
        val viewModel = viewModel()

        viewModel.refresh()

        assertEquals(OWNER_IN_WORKSPACE, viewModel.state.value)
        assertEquals(1, api.calls)
    }

    @Test
    fun test_F003_AC6_noConnectionOnForegroundKeepsTheScreen() {
        api.answerAccount(workspaces = listOf("John's Gym"))
        workspaces.answers += { throw IOException("offline") }
        val viewModel = viewModel()

        viewModel.refresh()

        assertEquals(OWNER_IN_WORKSPACE, viewModel.state.value)
    }

    // F004 AC10: what GET /v1/me lists per workspace goes to the capabilities helper, as the API answered it.
    @Test
    fun test_F004_AC10_passesTheWorkspacesWithTheirCapabilitiesOn() {
        api.answerAccount(workspaces = listOf("John's Gym", "Sarah Personal Training"))

        viewModel()

        assertEquals(listOf("John's Gym", "Sarah Personal Training"), listed.single().map { it.name })
        assertEquals(MeWorkspace.Capabilities.entries, listed.single().first().capabilities)
    }

    // F013 AC8: Vandaag reads the account again (a pull, *Opnieuw*, the foreground). It says what came of it, replaces the
    // capabilities with what the API lists now, and changes the home only when the workspace it shows is gone.
    @Test
    fun test_F013_AC8_refreshWorkspacesAnswersTheListAndReplacesTheCapabilities() {
        api.answerAccount(workspaces = listOf("John's Gym", "Sarah Personal Training"))
        api.answerAccount(
            workspaces = listOf("John's Gym", "Sarah Personal Training"),
            capabilitiesByWorkspace = mapOf("Sarah Personal Training" to emptyList()),
        )
        val viewModel = viewModel()

        val read = runBlocking { viewModel.refreshWorkspaces() }

        assertEquals(
            listOf("John's Gym", "Sarah Personal Training"),
            (read as WorkspacesRead.Listed).workspaces.map {
                it.name
            },
        )
        assertEquals("the capabilities helper is told again", 2, listed.size)
        assertEquals(emptyList<MeWorkspace.Capabilities>(), listed.last().last().capabilities)
        assertEquals(listed.last(), viewModel.workspaces.value)
        assertEquals("the home stays as it is", OWNER_IN_WORKSPACE, viewModel.state.value)
    }

    @Test
    fun test_F013_AC8_refreshWorkspacesWithoutAConnectionIsOfflineAndChangesNothing() {
        api.answerAccount(workspaces = listOf("John's Gym"))
        api.answers += { throw IOException("offline") }
        val viewModel = viewModel()

        val read = runBlocking { viewModel.refreshWorkspaces() }

        assertEquals(WorkspacesRead.Offline, read)
        assertEquals(1, listed.size)
        assertEquals(OWNER_IN_WORKSPACE, viewModel.state.value)
    }

    @Test
    fun test_F013_AC8_refreshWorkspacesWithAnAnswerThatIsNotTheAccountIsFailed() {
        api.answerAccount(workspaces = listOf("John's Gym"))
        api.answers += { Response.error(500, "{}".toResponseBody()) }
        api.answers += { throw SerializationException("not the account") }
        val viewModel = viewModel()

        assertEquals(WorkspacesRead.Failed, runBlocking { viewModel.refreshWorkspaces() })
        assertEquals(
            "a body that doesn't parse is not a connection problem",
            WorkspacesRead.Failed,
            runBlocking {
                viewModel.refreshWorkspaces()
            },
        )

        assertEquals(1, listed.size)
        assertEquals(OWNER_IN_WORKSPACE, viewModel.state.value)
    }

    @Test
    fun test_F013_AC8_refreshWorkspacesReloadsTheHomeWhenTheWorkspaceItShowsIsGone() {
        api.answerAccount(workspaces = listOf("John's Gym", "Sarah Personal Training"))
        api.answerAccount(workspaces = listOf("Sarah Personal Training"))
        api.answerAccount(workspaces = listOf("Sarah Personal Training"))
        val viewModel = viewModel()
        assertEquals("John's Gym", shown(viewModel))

        val read = runBlocking { viewModel.refreshWorkspaces() }

        assertEquals(listOf("Sarah Personal Training"), (read as WorkspacesRead.Listed).workspaces.map { it.name })
        assertEquals(
            "the account is read as on opening, which shows the next workspace",
            "Sarah Personal Training",
            shown(viewModel),
        )
        assertEquals(3, api.calls)
    }

    private fun shown(viewModel: HomeViewModel) =
        ((viewModel.state.value as MeState.Loaded).destination as HomeDestination.Workspace).name

    private fun shownWord(viewModel: HomeViewModel) =
        ((viewModel.state.value as MeState.Loaded).destination as HomeDestination.Workspace).trainerWord

    // F068 AC4: Sarah is in John's Gym (instructeur) and Yoga Loft (docent): the workspace shown carries its own word, also
    // right after she switches, and back; the word comes from the list the app already has, so a switch asks for nothing more.
    @Test
    fun test_F068_AC4_theWorkspaceShownCarriesItsOwnWordAlsoRightAfterSwitching() {
        val words = mapOf("John's Gym" to TrainerWord.INSTRUCTEUR, "Yoga Loft" to TrainerWord.DOCENT)
        repeat(3) {
            api.answerAccount(workspaces = listOf("John's Gym", "Yoga Loft"), trainerWords = words)
        }
        val viewModel = viewModel()
        assertEquals("John's Gym", shown(viewModel))
        assertEquals(TrainerWord.INSTRUCTEUR, shownWord(viewModel))

        viewModel.switchWorkspace(workspaceIdOf("Yoga Loft"))
        assertEquals("Yoga Loft", shown(viewModel))
        assertEquals(TrainerWord.DOCENT, shownWord(viewModel))

        viewModel.switchWorkspace(workspaceIdOf("John's Gym"))
        assertEquals(TrainerWord.INSTRUCTEUR, shownWord(viewModel))
    }

    // F012 AC7: the app opens in the workspace used last on this device while the person is still on its team.
    @Test
    fun test_F012_AC7_appOpensLastWorkspace() {
        rememberedBeforeStart(workspaceIdOf("Sarah Personal Training"))
        api.answerAccount(workspaces = listOf("John's Gym", "Sarah Personal Training"))

        assertEquals("Sarah Personal Training", shown(viewModel()))
    }

    // F012 AC5: Sarah was removed from the remembered workspace; the other one shows, without an error.
    @Test
    fun test_F012_AC5_aRememberedWorkspaceTheTeamAccessIsGoneFromFallsBackToTheOtherOne() {
        rememberedBeforeStart(workspaceIdOf("Sarah Personal Training"))
        api.answerAccount(workspaces = listOf("John's Gym"))

        assertEquals("John's Gym", shown(viewModel()))
    }

    // F012 AC7: the workspace the app opens is the one remembered, also the one it fell back to; adding Sarah's back later
    // doesn't take the app there.
    @Test
    fun test_F012_AC7_theWorkspaceFallenBackToIsTheOneRemembered() {
        rememberedBeforeStart(workspaceIdOf("Sarah Personal Training"))
        api.answerAccount(workspaces = listOf("John's Gym"))
        api.answerAccount(workspaces = listOf("John's Gym", "Sarah Personal Training"))
        assertEquals("John's Gym", shown(viewModel()))
        assertEquals(workspaceIdOf("John's Gym"), lastWorkspace.id)

        assertEquals("John's Gym", shown(viewModel()))
    }

    @Test
    fun test_F012_AC5_withNoWorkspaceLeftTheNoAccessStateShows() {
        rememberedBeforeStart(workspaceIdOf("Sarah Personal Training"))
        api.answerAccount(workspaces = emptyList(), canCreateWorkspace = false)

        assertEquals(HomeDestination.NoAccess, (viewModel().state.value as MeState.Loaded).destination)
    }

    @Test
    fun test_F012_AC5_aRemovalFoundOnForegroundFallsBackToTheOtherWorkspace() {
        rememberedBeforeStart(workspaceIdOf("Sarah Personal Training"))
        api.answerAccount(workspaces = listOf("John's Gym", "Sarah Personal Training"))
        api.answerAccount(workspaces = listOf("John's Gym"))
        workspaces.answerGone()
        val viewModel = viewModel()

        viewModel.refresh()

        assertEquals("John's Gym", shown(viewModel))
    }

    // F012 AC6: a switch remembers the workspace on this device and shows it, with the API's order untouched.
    @Test
    fun test_F012_AC6_switchingShowsTheOtherWorkspaceAndRemembersIt() {
        api.answerAccount(workspaces = listOf("John's Gym", "Sarah Personal Training"))
        api.answerAccount(workspaces = listOf("John's Gym", "Sarah Personal Training"))
        val viewModel = viewModel()
        assertEquals("John's Gym", shown(viewModel))

        viewModel.switchWorkspace(workspaceIdOf("Sarah Personal Training"))

        assertEquals("Sarah Personal Training", shown(viewModel))
        assertEquals(workspaceIdOf("Sarah Personal Training"), lastWorkspace.id)
        assertEquals(workspaceIdOf("Sarah Personal Training"), current.remembered.value)
    }

    @Test
    fun test_F012_AC6_switchingToTheWorkspaceShownChangesNothing() {
        api.answerAccount(workspaces = listOf("John's Gym", "Sarah Personal Training"))
        val viewModel = viewModel()

        viewModel.switchWorkspace(workspaceIdOf("John's Gym"))

        assertEquals(1, api.calls)
        assertEquals(workspaceIdOf("John's Gym"), lastWorkspace.id)
    }

    @Test
    @Isolation
    fun test_F012_AC6_aWorkspaceThePersonIsNotOnIsNotSwitchedTo() {
        api.answerAccount(workspaces = listOf("John's Gym", "Sarah Personal Training"))
        val viewModel = viewModel()

        viewModel.switchWorkspace(workspaceIdOf("Someone Else's Gym"))

        assertEquals("John's Gym", shown(viewModel))
        assertEquals(1, api.calls)
        assertEquals(workspaceIdOf("John's Gym"), lastWorkspace.id)
    }

    // F012 AC7: the workspace stays on this device across a sign-out and the next sign-in.
    @Test
    fun test_F012_AC7_aSignOutKeepsTheRememberedWorkspace() {
        repeat(3) { api.answerAccount(workspaces = listOf("John's Gym", "Sarah Personal Training")) }
        signInApi.answerSignedOut()
        val first = viewModel()
        first.switchWorkspace(workspaceIdOf("Sarah Personal Training"))

        first.signOut()

        assertEquals(workspaceIdOf("Sarah Personal Training"), lastWorkspace.id)
        assertEquals("Sarah Personal Training", shown(viewModel()))
    }

    // F012 AC10: the choice stays on the device; the app asks the API for the account and nothing else changes there.
    @Test
    fun test_F012_AC10_switchingSendsNothingToTheServer() {
        api.answerAccount(workspaces = listOf("John's Gym", "Sarah Personal Training"))
        api.answerAccount(workspaces = listOf("John's Gym", "Sarah Personal Training"))
        val viewModel = viewModel()

        viewModel.switchWorkspace(workspaceIdOf("Sarah Personal Training"))

        assertEquals(emptyList<Any>(), api.updates)
    }

    // F012 AC11: the capabilities handed on are those of the workspaces as the API lists them, again after a switch.
    @Test
    fun test_F012_AC11_aSwitchReadsTheCapabilitiesAgain() {
        api.answerAccount(workspaces = listOf("John's Gym", "Sarah Personal Training"))
        api.answerAccount(workspaces = listOf("John's Gym", "Sarah Personal Training"))
        val viewModel = viewModel()

        viewModel.switchWorkspace(workspaceIdOf("Sarah Personal Training"))

        assertEquals(2, listed.size)
    }

    @Test
    fun F001N_266_AC2_passesTheAccountIdOnOnceTheApiHasAnswered() {
        val answer = CompletableDeferred<Response<MeResponse>>()
        api.answers += { answer.await() }
        viewModel()
        assertEquals(emptyList<String>(), identified)

        answer.complete(Response.success(ownerAccount()))

        assertEquals(listOf(ACCOUNT_ID.toString()), identified)
    }

    // F025: the first `GET /v1/me` failed (offline): a later read of the account (Vandaag's pull, the foreground) names it too,
    // so the attendance queue can take the account's taps.
    @Test
    fun test_F025_1620_refreshWorkspacesNamesTheAccountWhenTheFirstReadFailed() {
        api.answers += { throw IOException("offline") }
        api.answerAccount(id = ACCOUNT_ID)
        val viewModel = viewModel()
        assertEquals(emptyList<String>(), identified)

        runBlocking { viewModel.refreshWorkspaces() }

        assertEquals(listOf(ACCOUNT_ID.toString()), identified)
    }

    @Test
    fun test_F025_1620_refreshWorkspacesAfterTheSignOutNamesNobody() {
        api.answerAccount(id = ACCOUNT_ID)
        val viewModel = viewModel()
        identified.clear()
        session.expire("tok-1")
        api.answerAccount(id = ACCOUNT_ID)

        runBlocking { viewModel.refreshWorkspaces() }

        assertEquals(emptyList<String>(), identified)
    }

    @Test
    fun F001N_266_AC2_passesNothingOnWhenTheApiDoesNotAnswerWithTheAccount() {
        api.answers += { throw IOException("offline") }
        api.answers += { Response.error(401, "{}".toResponseBody()) }
        val viewModel = viewModel()

        viewModel.retry()

        assertEquals(emptyList<String>(), identified)
    }

    @Test
    fun F001N_266_AC3_anAnswerAfterTheSignOutPassesNothingOn() {
        val answer = CompletableDeferred<Response<MeResponse>>()
        api.answers += { answer.await() }
        signInApi.answerSignedOut()
        val viewModel = viewModel()
        viewModel.signOut()
        assertEquals(1, clears)

        answer.complete(Response.success(ownerAccount()))

        assertEquals(emptyList<String>(), identified)
    }

    @Test
    fun F001N_266_AC3_anAnswerAfterTheTokenWasRejectedPassesNothingOn() {
        val answer = CompletableDeferred<Response<MeResponse>>()
        api.answers += { answer.await() }
        viewModel()
        session.expire("tok-1")

        answer.complete(Response.success(ownerAccount()))

        assertEquals(emptyList<String>(), identified)
    }

    @Test
    fun F001N_266_AC3_signingOutClearsTheReportingUser() {
        api.answerAccount(id = ACCOUNT_ID)
        signInApi.answerSignedOut()
        val viewModel = viewModel()
        assertEquals(0, clears)

        viewModel.signOut()

        assertEquals(1, clears)
    }

    @Test
    fun F001N_AC4_loadsUntilTheApiAnswers() {
        val answer = CompletableDeferred<Response<MeResponse>>()
        api.answers += { answer.await() }

        val viewModel = viewModel()

        assertEquals(MeState.Loading, viewModel.state.value)
    }

    @Test
    fun F001N_AC4_offlineShowsRetry() {
        api.answers += { throw IOException("offline") }
        api.answerAccount()
        val viewModel = viewModel()
        assertEquals(MeState.Failed, viewModel.state.value)

        viewModel.retry()

        assertEquals(OWNER_IN_WORKSPACE, viewModel.state.value)
    }

    @Test
    fun F001N_AC4_rejectedTokenFails() {
        // The auth layer signs the app out on this 401 (AuthInterceptorTest); the screen only has to not show an address.
        api.answers += { Response.error(401, "{}".toResponseBody()) }

        assertEquals(MeState.Failed, viewModel().state.value)
    }

    @Test
    fun F001N_AC10_signOutEndsTheSessionDeletesTheTokenAndShowsSignIn() {
        api.answerAccount()
        signInApi.answerSignedOut()
        val viewModel = viewModel()
        val generation = session.state.value.generation

        viewModel.signOut()

        assertEquals(listOf("tok-1"), signOutTokens)
        assertEquals(1, signInApi.signOuts)
        assertNull(store.read())
        assertEquals(AuthState(signedIn = false, generation = generation + 1), session.state.value)
        assertEquals(false, viewModel.signingOut.value)
    }

    @Test
    fun F001N_AC10_theTokenIsDeletedBeforeTheRequestAnswers() {
        api.answerAccount()
        val answer = CompletableDeferred<Response<Unit>>()
        signInApi.signOutAnswers += { answer.await() }
        val viewModel = viewModel()

        viewModel.signOut()

        // A phone that is switched off now, or an app that is killed, opens signed out; the request still has its token.
        assertNull(store.read())
        assertNull(session.token())
        assertEquals(listOf("tok-1"), signOutTokens)
        assertEquals(true, viewModel.signingOut.value)
        assertEquals(true, session.state.value.signedIn)

        answer.complete(Response.success(204, Unit))
        assertEquals(false, session.state.value.signedIn)
    }

    @Test
    fun F001N_AC10_signOutDeletesTokenEvenOffline() {
        api.answerAccount()
        signInApi.signOutAnswers += { throw IOException("offline") }
        val viewModel = viewModel()

        viewModel.signOut()

        assertNull(store.read())
        assertEquals(false, session.state.value.signedIn)
        assertEquals(false, session.state.value.afterRejection)
    }

    @Test
    fun F001N_AC10_signOutRefusedByTheApiShowsTheNotice() {
        api.answerAccount()
        signInApi.signOutAnswers += { Response.error(401, "{}".toResponseBody()) }
        val viewModel = viewModel()

        viewModel.signOut()

        assertNull(store.read())
        assertEquals(false, session.state.value.signedIn)
        assertEquals(true, session.state.value.afterRejection)
    }

    @Test
    fun F001N_AC10_aServerErrorStillSignsOutWithoutNotice() {
        api.answerAccount()
        signInApi.signOutAnswers += { Response.error(500, "{}".toResponseBody()) }
        val viewModel = viewModel()

        viewModel.signOut()

        assertEquals(false, session.state.value.signedIn)
        assertEquals(false, session.state.value.afterRejection)
    }

    @Test
    fun F001N_AC10_signOutDoesNotWaitForAHangingConnection() {
        api.answerAccount()
        signInApi.signOutAnswers += { CompletableDeferred<Response<Unit>>().await() }
        val viewModel = viewModel()

        viewModel.signOut()
        scheduler.advanceTimeBy(9.seconds)
        scheduler.runCurrent()
        assertEquals(true, session.state.value.signedIn)
        assertEquals(true, viewModel.signingOut.value)

        // The ten seconds are over: the sign-in screen shows, whatever the connection does.
        scheduler.advanceTimeBy(1.seconds)
        scheduler.runCurrent()
        assertEquals(false, session.state.value.signedIn)
        assertEquals(false, session.state.value.afterRejection)
        assertNull(store.read())
    }

    @Test
    fun F001N_AC10_aSignOutThatAnswersInTimeStopsTheWait() {
        api.answerAccount()
        val answer = CompletableDeferred<Response<Unit>>()
        signInApi.signOutAnswers += { answer.await() }
        val viewModel = viewModel()
        viewModel.signOut()
        scheduler.advanceTimeBy(5.seconds)
        scheduler.runCurrent()

        answer.complete(Response.success(204, Unit))

        // Nothing is left to wait for at the ten seconds: the timer ended with the answer.
        assertEquals(false, session.state.value.signedIn)
        scheduler.advanceUntilIdle()
        assertEquals(5_000L, scheduler.currentTime)
    }

    @Test
    fun F001N_AC10_aSecondTapWhileSigningOutIsIgnored() {
        api.answerAccount()
        val answer = CompletableDeferred<Response<Unit>>()
        signInApi.signOutAnswers += { answer.await() }
        val viewModel = viewModel()

        viewModel.signOut()
        viewModel.signOut()

        assertEquals(1, signInApi.signOuts)
        assertEquals(listOf("tok-1"), signOutTokens)
    }

    @Test
    fun F001N_AC10_signOutWithoutATokenSkipsTheRequest() {
        val empty = Session(InMemorySessionStore())
        api.answerAccount()
        val viewModel =
            HomeViewModel(api, workspaces, empty, current, connectivity, {
                signInApi
            }, { identified += it }, dispatcher)

        viewModel.signOut()

        assertEquals(0, signInApi.signOuts)
        assertEquals(false, empty.state.value.signedIn)
    }

    // F025 AC8, #1620: an app opened offline has no account yet, so what was tapped waits. The reconnection reads the account
    // again, without a pull to refresh, and that sends what waits.
    @Test
    fun test_F025_AC8_aFailedAccountReadIsReadAgainWhenTheConnectionComesBack() {
        connectivity.setOnline(false)
        api.answers += { throw IOException("offline") }
        val viewModel = viewModel()
        assertEquals(MeState.Failed, viewModel.state.value)
        assertEquals(emptyList<String>(), identified)

        api.answerAccount(workspaces = listOf("John's Gym"))
        connectivity.setOnline(true)

        assertEquals(OWNER_IN_WORKSPACE, viewModel.state.value)
        assertEquals("the account is known now", 1, identified.size)
        assertEquals(2, api.calls)
    }

    @Test
    fun test_F025_AC8_aReconnectionDoesNotReadAnAccountThatIsLoaded() {
        api.answerAccount(workspaces = listOf("John's Gym"))
        val viewModel = viewModel()
        connectivity.setOnline(false)

        connectivity.setOnline(true)

        assertEquals(OWNER_IN_WORKSPACE, viewModel.state.value)
        assertEquals(1, api.calls)
    }

    @Test
    fun test_F025_AC8_tapsOfAnOfflineStartAreSentInOrderWhenTheConnectionComesBackWithoutAPull() {
        val sessions = FakeSessionsApi()
        val kracht = UUID.nameUUIDFromBytes("kracht".toByteArray())
        val names = listOf("Anna de Vries", "Bram Jansen", "Chris Bakker")
        sessions.attendance.add(
            FakeAttendance(
                kracht,
                opensAt = FakeAttendanceServer.at(Instant.parse("2026-09-22T15:30:00Z")),
                participants = names.map { FakeAttendanceServer.participant(it) }.toMutableList(),
            ),
        )
        sessions.attendance.now = Instant.parse("2026-09-22T16:10:00Z")
        connectivity.setOnline(false)
        val queue = AttendanceQueue(
            sessions,
            MemoryPersonalStore(),
            connectivity,
            session.signInId(),
            retryAfter = null,
            io = dispatcher,
        )
        api.answers += { throw IOException("offline") }
        val viewModel = HomeViewModel(
            api,
            workspaces,
            session,
            current,
            connectivity,
            { signInApi },
            { queue.adopt(it) },
            dispatcher,
        )
        assertEquals("no account: `GET /v1/me` failed", MeState.Failed, viewModel.state.value)
        names.forEach {
            queue.enqueue(
                workspaceIdOf("John's Gym"),
                kracht,
                QueueAction.Set(participantIdOf(it), AttendanceStatus.ATTENDED),
            )
        }
        assertEquals(emptyList<Any>(), sessions.attendance.sent)

        api.answerAccount(workspaces = listOf("John's Gym"))
        connectivity.setOnline(true)

        assertEquals(names.map(::participantIdOf), sessions.attendance.sent.map { it.clientId })
        assertEquals(true, queue.state.value.entries.isEmpty())
    }
}

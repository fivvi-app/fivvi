package app.fivvi.pro.personal

import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import app.fivvi.api.apis.MeApi
import app.fivvi.api.models.Client
import app.fivvi.api.models.MeWorkspace
import app.fivvi.api.models.MyDay
import app.fivvi.core.AppLanguage
import app.fivvi.core.R
import app.fivvi.core.appLanguageParameters
import app.fivvi.core.auth.InMemorySessionStore
import app.fivvi.core.auth.Session
import app.fivvi.core.me.FakeMeApi
import app.fivvi.core.me.workspaceIdOf
import app.fivvi.core.signin.FakeSignInApi
import app.fivvi.pro.AppRule
import app.fivvi.pro.UI_TIMEOUT_MILLIS
import app.fivvi.pro.clients.FakeClientsApi
import app.fivvi.pro.clients.clientOf
import app.fivvi.pro.home.FakeTrainersApi
import app.fivvi.pro.home.HomeTags
import app.fivvi.pro.localizedString
import app.fivvi.pro.sessions.FakeSessionsApi
import app.fivvi.pro.sessions.NewSessionTags
import app.fivvi.pro.sessions.SessionTags
import app.fivvi.pro.sessions.sessionOf
import app.fivvi.pro.sessions.trainerOf
import app.fivvi.pro.waitUntilTagExists
import java.time.LocalDateTime
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

private const val JOHNS_GYM = "John's Gym"
private const val SARAH_PT = "Sarah Personal Training"

// F013, TD-01 *Vandaag* through the whole app with fake API clients, in nl-NL and en: Sarah is a Trainer of John's Gym
// (the current workspace, first by name) and the Owner of Sarah Personal Training, on Tuesday 22 September 2026 at 08:35.
@RunWith(Parameterized::class)
class TodayFlowTest(@Suppress("UNUSED_PARAMETER") tag: String, private val language: AppLanguage) {
    @get:Rule
    val compose = createEmptyComposeRule()

    @get:Rule
    val app = AppRule()

    private val me = FakeMeApi()
    private val sessions = FakeSessionsApi()
    private val clients = FakeClientsApi()
    private val trainers = FakeTrainersApi()
    private val personal = MemoryPersonalStore()
    private val sarah = trainerOf("Sarah")
    private val anna = clientOf("Anna de Vries", "anna@example.com", Client.EmailLocale.NL_NL)

    private fun string(id: Int, vararg args: Any) = localizedString(language, id, *args)

    // Sarah's account as `GET /v1/me` answers it, [times] times: the home reads it at start; on each foreground the
    // language and Vandaag read it, and Vandaag on each pull.
    private fun answerAccount(times: Int, workspaces: List<String> = listOf(JOHNS_GYM, SARAH_PT)) = repeat(times) {
        me.answerAccount(
            email = "trainer@example.com",
            name = "Sarah",
            workspaces = workspaces,
            role = MeWorkspace.Role.OWNER,
        )
    }

    private fun launch(
        day: MyDay = PersonalFixtures.sarah(),
        session: Session = Session(InMemorySessionStore("token-1")),
    ) {
        me.day = day
        clients.clients += anna
        sessions.clients[anna.id] = anna
        sessions.sessions[PersonalFixtures.sessionIdOf("anna")] = sessionOf(
            id = PersonalFixtures.sessionIdOf("anna"),
            client = anna,
            trainer = sarah,
            start = LocalDateTime.of(2026, 9, 22, 9, 0),
        )
        app.launch(
            device = listOf(language.tag),
            meApi = me,
            sessionsApi = sessions,
            clientsApi = clients,
            trainersApi = trainers,
            session = session,
            startTab = ProTab.TODAY,
            personal = personal,
            now = PersonalFixtures.now,
        )
    }

    private fun waitForRow(id: String = "mark") =
        compose.waitUntilTagExists(TodayTags.row(PersonalFixtures.sessionIdOf(id)))

    private fun waitUntilGone(tag: String) = compose.waitUntil(UI_TIMEOUT_MILLIS) {
        compose.onAllNodes(hasTestTag(tag)).fetchSemanticsNodes().isEmpty()
    }

    @Test
    fun test_F013_AC1_theAppOpensOnVandaagAndReadsTheDayForToday() {
        answerAccount(2)
        launch()

        waitForRow()

        compose.onNodeWithTag(ProTab.TODAY.tag).assertIsSelected()
        compose.onNodeWithTag(TodayTags.TITLE).assertTextEquals(string(R.string.my_day_app_title))
        assertEquals(
            "one read, for today in Dutch time, from this app",
            listOf(PersonalFixtures.DAY to MeApi.SurfaceGetMyDay.ANDROID),
            me.dayRequests.toList(),
        )
        // The tabs are Vandaag, Agenda and the home.
        compose.onNodeWithTag(ProTab.CALENDAR.tag).assertTextEquals(string(R.string.my_calendar_app_tab))
        compose.onNodeWithTag(ProTab.HOME.tag).assertTextEquals(string(R.string.home_tab))
    }

    @Test
    fun test_F013_AC4_itemOpensInItsOwnWorkspace() {
        answerAccount(2)
        launch()
        compose.waitUntilTagExists(TodayTags.NEXT_OPEN)

        compose.onNodeWithTag(TodayTags.NEXT_OPEN).performClick()

        // Anna's session is Sarah Personal Training's: TD-02 asks for it there, whichever workspace is the current one.
        compose.waitUntilTagExists(SessionTags.TITLE)
        assertEquals(
            listOf(workspaceIdOf(SARAH_PT) to PersonalFixtures.sessionIdOf("anna")),
            sessions.readIn.toList(),
        )
        compose.waitUntilTagExists(SessionTags.WORKSPACE)
        compose.onNodeWithTag(SessionTags.WORKSPACE).assertTextEquals(SARAH_PT)
        app.pressBack()
        compose.waitUntilTagExists(TodayTags.TITLE)

        compose.onNodeWithTag(ProTab.HOME.tag).performClick()
        compose.waitUntilTagExists(HomeTags.WORKSPACE_NAME)
        compose.onNodeWithTag(HomeTags.WORKSPACE_NAME).assertTextEquals(JOHNS_GYM)
    }

    @Test
    fun test_F013_AC4_aWorkspaceThatCantBeReadSaysSoWithOpnieuw() {
        // The account lists John's Gym only: the next item's workspace, Sarah Personal Training, is not the person's any more.
        answerAccount(3, workspaces = listOf(JOHNS_GYM))
        launch()
        compose.waitUntilTagExists(TodayTags.NEXT_OPEN)

        compose.onNodeWithTag(TodayTags.NEXT_OPEN).performClick()

        compose.waitUntilTagExists(PersonalTags.UNAVAILABLE)
        compose.onNodeWithTag(PersonalTags.UNAVAILABLE).assertTextEquals(string(R.string.sessions_form_load_failed))
        compose.onNodeWithTag(PersonalTags.RETRY).assertTextEquals(string(R.string.my_day_app_retry))
        app.pressBack()
        compose.waitUntilTagExists(TodayTags.TITLE)
    }

    @Test
    fun test_F013_AC7_offlineShowsCachedDay() {
        answerAccount(2)
        launch()
        waitForRow()
        app.close()

        // The phone is offline now, and opens the app again: the day it kept is on screen with its banner.
        me.failDayOffline()
        answerAccount(3)
        launch()

        waitForRow()
        compose.waitUntilTagExists(TodayTags.OFFLINE)
        compose.onNodeWithTag(TodayTags.OFFLINE).assertTextEquals(string(R.string.my_day_app_offline, "08:35"))
        compose.onNodeWithTag(TodayTags.CARD_PLAN).assertIsNotEnabled()
        compose.onNodeWithTag(HomeTags.NEW).assertIsNotEnabled()

        me.recoverDay()
        app.backgroundAndForeground()
        waitUntilGone(TodayTags.OFFLINE)
        compose.onNodeWithTag(HomeTags.NEW).assertIsEnabled()
    }

    @Test
    fun test_F013_AC8_removedWorkspaceNoticeOnce() {
        answerAccount(2)
        launch()
        waitForRow()

        // Sarah is taken off the team of the other workspace; coming back to the app reads the account again.
        answerAccount(3, workspaces = listOf(JOHNS_GYM))
        app.backgroundAndForeground()

        compose.waitUntilTagExists(TodayTags.NOTICE)
        compose.onNodeWithTag(TodayTags.NOTICE).assertTextEquals(string(R.string.my_day_app_removed, SARAH_PT))
        compose.onNodeWithTag(TodayTags.NOTICE_DISMISS).performClick()
        waitUntilGone(TodayTags.NOTICE)
        app.backgroundAndForeground()
        compose.waitForIdle()
        assertEquals("it shows once", 0, compose.onAllNodes(hasTestTag(TodayTags.NOTICE)).fetchSemanticsNodes().size)
    }

    @Test
    fun test_F013_design_planOpensTheFormAtTheStartOfTheGap() {
        answerAccount(2)
        launch()
        compose.waitUntilTagExists(TodayTags.CARD_PLAN)

        compose.onNodeWithTag(TodayTags.CARD_PLAN).performClick()

        compose.waitUntilTagExists(NewSessionTags.SAVE)
        compose.waitUntilTagExists("${NewSessionTags.PREFIX}.startValue")
        compose.onNodeWithTag("${NewSessionTags.PREFIX}.startValue").assertTextEquals("12:00")
    }

    @Test
    fun test_F013_AC7_whatVandaagKeptIsGoneWhenTheAppStartsSignedOut() {
        personal.write("day.json", "{}".encodeToByteArray())
        app.launch(
            device = listOf(language.tag),
            signInApi = FakeSignInApi(),
            session = Session(InMemorySessionStore()),
            personal = personal,
        )

        compose.waitUntilTagExists("signIn.email")
        compose.waitUntil(UI_TIMEOUT_MILLIS) { personal.read("day.json") == null }
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}

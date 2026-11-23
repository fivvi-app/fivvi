package app.fivvi.pro.personal

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import app.fivvi.api.apis.MeApi
import app.fivvi.api.models.Client
import app.fivvi.api.models.MeWorkspace
import app.fivvi.api.models.MyDay
import app.fivvi.core.AppLanguage
import app.fivvi.core.R
import app.fivvi.core.appLanguageParameters
import app.fivvi.core.me.FakeMeApi
import app.fivvi.core.me.workspaceIdOf
import app.fivvi.pro.AppRule
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
import java.time.LocalDate
import java.time.LocalDateTime
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

private const val JOHNS_GYM = "John's Gym"
private const val SARAH_PT = "Sarah Personal Training"

// F013, TD-04 *Agenda* through the whole app with fake API clients, in nl-NL and en: Sarah is a Trainer of John's Gym (the
// current workspace, first by name) and the Owner of Sarah Personal Training, on Tuesday 22 September 2026 at 08:35.
@RunWith(Parameterized::class)
class AgendaFlowTest(@Suppress("UNUSED_PARAMETER") tag: String, private val language: AppLanguage) {
    @get:Rule
    val compose = createEmptyComposeRule()

    @get:Rule
    val app = AppRule()

    private val me = FakeMeApi()
    private val sessions = FakeSessionsApi()
    private val clients = FakeClientsApi()
    private val personal = MemoryPersonalStore()
    private val sarah = trainerOf("Sarah")
    private val anna = clientOf("Anna de Vries", "anna@example.com", Client.EmailLocale.NL_NL)

    private fun string(id: Int, vararg args: Any) = localizedString(language, id, *args)

    private fun answerAccount(times: Int) = repeat(times) {
        me.answerAccount(
            email = "trainer@example.com",
            name = "Sarah",
            workspaces = listOf(JOHNS_GYM, SARAH_PT),
            role = MeWorkspace.Role.OWNER,
        )
    }

    private fun launch(day: MyDay = PersonalFixtures.sarah(), tab: ProTab = ProTab.TODAY) {
        me.day = day
        me.sessions = PersonalFixtures.septemberWeek
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
            trainersApi = FakeTrainersApi(),
            startTab = tab,
            personal = personal,
            now = PersonalFixtures.now,
        )
    }

    private fun rowTag(id: String) = "${AgendaTags.ROWS}.row.${PersonalFixtures.sessionIdOf(id)}"

    private fun exists(tag: String) = compose.onAllNodes(hasTestTag(tag)).fetchSemanticsNodes().isNotEmpty()

    private fun openAgenda() {
        compose.waitUntilTagExists(ProTab.CALENDAR.tag)
        compose.onNodeWithTag(ProTab.CALENDAR.tag).performClick()
        compose.waitUntilTagExists(AgendaTags.TITLE)
    }

    @Test
    fun test_F013_AC5_theTomorrowLineOpensAgendaOnThatDay() {
        answerAccount(4)
        launch()
        compose.waitUntilTagExists(TodayTags.NEXT_OPEN)
        // The line is the last of the day, under the fold of a phone: the list is lazy, so it is scrolled to.
        compose.onNode(hasScrollAction()).performScrollToNode(hasTestTag(TodayTags.TOMORROW))

        compose.onNodeWithTag(TodayTags.TOMORROW).performClick()

        // Agenda opens on 23 September, in the week, with its three sessions, the first at 07:00 (AC5).
        compose.waitUntilTagExists(AgendaTags.TITLE)
        compose.onNodeWithTag(AgendaTags.day(LocalDate.parse("2026-09-23"))).assertIsSelected()
        compose.onNodeWithTag(AgendaTags.MODE_WEEK).assertIsSelected()
        compose.onNodeWithTag(ProTab.CALENDAR.tag).assertIsSelected()
        // The week is a lazy list: Wednesday's sessions are scrolled to.
        compose.onNode(hasScrollAction()).performScrollToNode(hasTestTag(rowTag("evening")))
        listOf("early", "mid", "evening").forEach { assertTrue(it, exists(rowTag(it))) }
        val first = compose.onNodeWithTag(rowTag("early"), useUnmergedTree = true).fetchSemanticsNode()
            .config.getOrNull(SemanticsProperties.ContentDescription).orEmpty().joinToString()
        assertTrue(first, first.contains("07:00"))
        // A week renders from one request (AC15), asked for by this app.
        assertEquals(
            listOf(Triple("2026-09-21", "2026-09-27", MeApi.SurfaceListMySessions.ANDROID)),
            me.sessionRequests.toList(),
        )
    }

    @Test
    fun test_F013_AC4_aSessionOpensInItsOwnWorkspaceAndBackReturnsToAgenda() {
        answerAccount(4)
        launch()
        openAgenda()
        compose.waitUntilTagExists(rowTag("anna"))
        compose.onNodeWithTag(AgendaTags.day(LocalDate.parse("2026-09-24"))).performClick()

        compose.onNodeWithTag(rowTag("anna"), useUnmergedTree = true).performClick()

        compose.waitUntilTagExists(SessionTags.TITLE)
        assertEquals(
            listOf(workspaceIdOf(SARAH_PT) to PersonalFixtures.sessionIdOf("anna")),
            sessions.readIn.toList(),
        )
        app.pressBack()
        compose.waitUntilTagExists(AgendaTags.TITLE)
        compose.waitUntilTagExists(AgendaTags.day(LocalDate.parse("2026-09-24")))
        compose.onNodeWithTag(AgendaTags.day(LocalDate.parse("2026-09-24"))).assertIsSelected()
    }

    @Test
    fun test_F013_design_plusIsInTheBarAndPlansASession() {
        answerAccount(4)
        launch()
        openAgenda()

        compose.waitUntilTagExists(HomeTags.NEW)
        compose.onNodeWithTag(HomeTags.NEW).assertIsEnabled().performClick()
        compose.waitUntilTagExists(HomeTags.NEW_PRIVATE_SESSION)
        compose.onNodeWithTag(HomeTags.NEW_PRIVATE_SESSION).performClick()

        compose.waitUntilTagExists(NewSessionTags.SAVE)
    }

    @Test
    fun test_F013_design_plusIsOffWithoutAConnection() {
        answerAccount(4)
        launch()
        openAgenda()
        compose.waitUntilTagExists(rowTag("anna"))
        app.close()

        // The phone is offline now, and opens the app again on Agenda: the week it kept is on screen, with the banner.
        me.failSessionsOffline()
        answerAccount(4)
        launch(tab = ProTab.CALENDAR)

        compose.waitUntilTagExists(AgendaTags.OFFLINE)
        compose.onNodeWithTag(AgendaTags.OFFLINE).assertTextEquals(string(R.string.my_day_app_offline, "08:35"))
        compose.waitUntilTagExists(rowTag("anna"))
        compose.onNodeWithTag(HomeTags.NEW).assertIsNotEnabled()

        me.recoverSessions()
        app.backgroundAndForeground()
        compose.waitUntil(5_000) { !exists(AgendaTags.OFFLINE) }
        compose.onNodeWithTag(HomeTags.NEW).assertIsEnabled()
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}

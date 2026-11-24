package app.fivvi.pro.personal

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import app.fivvi.api.models.CancelClassDateRequest
import app.fivvi.api.models.CancelPrivateSessionRequest
import app.fivvi.api.models.Client
import app.fivvi.api.models.MeWorkspace
import app.fivvi.api.models.MyDay
import app.fivvi.api.models.MyDayNext
import app.fivvi.api.models.PersonalSession
import app.fivvi.api.models.Session
import app.fivvi.core.AppLanguage
import app.fivvi.core.R
import app.fivvi.core.appLanguageParameters
import app.fivvi.core.me.FakeMeApi
import app.fivvi.core.net.FakeConnectivity
import app.fivvi.pro.AppRule
import app.fivvi.pro.UI_TIMEOUT_MILLIS
import app.fivvi.pro.classes.ClassDateTags
import app.fivvi.pro.classes.FakeGroupClassesApi
import app.fivvi.pro.classes.classDateOf
import app.fivvi.pro.classes.groupClassOf
import app.fivvi.pro.clients.FakeClientsApi
import app.fivvi.pro.clients.clientOf
import app.fivvi.pro.home.FakeTrainersApi
import app.fivvi.pro.localizedString
import app.fivvi.pro.sessions.CancelSessionTags
import app.fivvi.pro.sessions.FakeSessionsApi
import app.fivvi.pro.sessions.RescheduleTags
import app.fivvi.pro.sessions.SessionTags
import app.fivvi.pro.sessions.sessionOf
import app.fivvi.pro.sessions.trainerOf
import app.fivvi.pro.waitUntilTagExists
import java.io.IOException
import java.time.LocalDateTime
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

private const val JOHNS_GYM = "John's Gym"
private const val SARAH_PT = "Sarah Personal Training"

// F026 through the whole app with fake API clients, in nl-NL and en: Sarah is the Owner of both workspaces (a Trainer in the
// tests that say so), on Tuesday 22 September 2026 at 08:35. *Annuleren* of TD-02 (PS-06) and *Les annuleren* of TD-03, and
// what Vandaag and Agenda show of a cancelled session.
@RunWith(Parameterized::class)
class CancelFlowTest(@Suppress("UNUSED_PARAMETER") tag: String, private val language: AppLanguage) {
    @get:Rule
    val compose = createEmptyComposeRule()

    @get:Rule
    val app = AppRule()

    private val me = FakeMeApi()
    private val sessions = FakeSessionsApi()
    private val classes = FakeGroupClassesApi(sessions)
    private val clients = FakeClientsApi()
    private val connectivity = FakeConnectivity()
    private val sarah = trainerOf("Sarah")
    private val tom = trainerOf("Tom")
    private val anna = clientOf("Anna de Vries", "anna@example.com", Client.EmailLocale.NL_NL)
    private val mark = clientOf("Mark Jansen", "mark@example.com", Client.EmailLocale.EN)
    private val annaId = PersonalFixtures.sessionIdOf("anna")
    private val markId = PersonalFixtures.sessionIdOf("mark")
    private val krachtId = PersonalFixtures.sessionIdOf("kracht")

    private fun string(id: Int, vararg args: Any) = localizedString(language, id, *args)

    private fun answerAccount(
        role: MeWorkspace.Role = MeWorkspace.Role.OWNER,
        capabilities: List<MeWorkspace.Capabilities> = MeWorkspace.Capabilities.values().toList(),
    ) = repeat(8) {
        me.answerAccount(
            email = "trainer@example.com",
            name = "Sarah",
            workspaces = listOf(JOHNS_GYM, SARAH_PT),
            role = role,
            capabilities = capabilities,
            teamMemberId = sarah.id,
        )
    }

    private val annaCancelled = PersonalFixtures.session(
        "anna",
        PersonalFixtures.sarahPT,
        "09:00",
        "10:00",
        client = "Anna de Vries",
        place = "TrainMore Zuid",
        cancelled = true,
    )

    // The day as the API answers it once Anna's session is cancelled: she is no longer the next one, Mark is.
    private fun dayAfter(): MyDay = PersonalFixtures.sarah(
        items = listOf(annaCancelled, PersonalFixtures.mark, PersonalFixtures.kracht, PersonalFixtures.krachtCancelled),
    ).copy(next = MyDayNext(markId, MyDayNext.State.UPCOMING, 145))

    private fun launch() {
        me.day = PersonalFixtures.sarah()
        me.sessions = PersonalFixtures.septemberWeek
        clients.clients += listOf(anna, mark)
        sessions.clients += listOf(anna, mark).associateBy { it.id }
        sessions.sessions[annaId] = sessionOf(
            id = annaId,
            client = anna,
            trainer = sarah,
            start = LocalDateTime.of(2026, 9, 22, 9, 0),
        )
        sessions.sessions[markId] = sessionOf(
            id = markId,
            client = mark,
            trainer = tom,
            start = LocalDateTime.of(2026, 9, 22, 11, 0),
        )
        val kracht = groupClassOf("Kracht", trainer = sarah)
        classes.classes[kracht.id] = kracht
        sessions.sessions[krachtId] = classDateOf(
            krachtId,
            kracht,
            sarah,
            start = LocalDateTime.of(2026, 9, 22, 15, 0),
            booked = 3,
        )
        sessions.onCancelled = { cancelled ->
            if (cancelled.id == annaId) {
                me.day = dayAfter()
                me.sessions = PersonalFixtures.septemberWeek.map { if (it.sessionId == annaId) annaCancelled else it }
            }
        }
        app.launch(
            device = listOf(language.tag),
            meApi = me,
            sessionsApi = sessions,
            groupClassesApi = classes,
            clientsApi = clients,
            trainersApi = FakeTrainersApi(),
            startTab = ProTab.TODAY,
            personal = MemoryPersonalStore(),
            now = PersonalFixtures.now,
            connectivity = connectivity,
        )
    }

    private fun openAnna() {
        compose.waitUntilTagExists(TodayTags.NEXT_OPEN)
        compose.onNodeWithTag(TodayTags.NEXT_OPEN).performClick()
        compose.waitUntilTagExists(SessionTags.MENU)
        compose.waitUntilTagExists(SessionTags.WORKSPACE)
    }

    private fun openRow(id: java.util.UUID) {
        compose.waitUntilTagExists(TodayTags.TITLE)
        compose.onNode(hasScrollAction()).performScrollToNode(hasTestTag(TodayTags.row(id)))
        compose.onNodeWithTag(TodayTags.row(id)).performClick()
    }

    private fun exists(tag: String) = compose.onAllNodes(hasTestTag(tag)).fetchSemanticsNodes().isNotEmpty()

    private fun SemanticsNodeInteraction.names(): String =
        fetchSemanticsNode().config.getOrNull(SemanticsProperties.ContentDescription).orEmpty().joinToString()

    private fun textOf(tag: String) = compose.onNodeWithTag(tag).fetchSemanticsNode().config
        .getOrNull(SemanticsProperties.Text).orEmpty().joinToString("")

    private fun waitUntil(what: String, condition: () -> Boolean) {
        compose.waitUntil(UI_TIMEOUT_MILLIS, condition)
        assertTrue(what, condition())
    }

    // The ⋯ menu of TD-02 has *Annuleren* for the Owner, and PS-06 opens with *De klant* chosen.
    private fun openCancelForm() {
        compose.onNodeWithTag(SessionTags.MENU).performClick()
        compose.waitUntilTagExists(SessionTags.CANCEL)
        compose.onNodeWithTag(SessionTags.CANCEL).performClick()
        compose.waitUntilTagExists(CancelSessionTags.TITLE)
    }

    @Test
    fun test_F026_AC1a_clientCancelNudgesReschedule() {
        answerAccount()
        launch()
        openAnna()

        openCancelForm()

        // *De klant* first: the question about another time, with **Verplaatsen** and *Toch annuleren*, and no cancel button.
        compose.onNodeWithTag(
            CancelSessionTags.NUDGE,
        ).assertTextEquals(string(R.string.sessions_cancel_nudge_question))
        compose.onNodeWithTag(
            CancelSessionTags.RESCHEDULE,
        ).assertTextEquals(string(R.string.sessions_cancel_nudge_reschedule))
        assertTrue(!exists(CancelSessionTags.SUBMIT))
        compose.onNodeWithTag(CancelSessionTags.RESCHEDULE).performClick()

        // Verplaatsen opens PS-05 for the same session and nothing is cancelled.
        compose.waitUntilTagExists(RescheduleTags.SUBMIT)
        assertTrue(sessions.cancelled.isEmpty())
    }

    @Test
    fun test_F026_AC1_aCancellationOnTheClientsRequestSaysSoInTheBanner() {
        answerAccount()
        launch()
        openAnna()
        openCancelForm()

        compose.onNodeWithTag(CancelSessionTags.CANCEL_ANYWAY).performClick()
        compose.waitUntilTagExists(CancelSessionTags.SUBMIT)
        compose.onNodeWithTag(CancelSessionTags.NOTIFY).assertIsEnabled()
        compose.onNodeWithTag(CancelSessionTags.SUBMIT).performClick()

        compose.waitUntilTagExists(SessionTags.CANCELLED)
        val request = sessions.cancelled.single().third
        assertEquals(CancelPrivateSessionRequest.Initiator.CLIENT, request.initiator)
        assertEquals(false, request.notify)
        assertTrue(textOf(SessionTags.CANCELLED).endsWith(string(R.string.sessions_page_cancelled_by_client)))
    }

    @Test
    fun test_F026_AC4_cancelSessionFromSessionScreen() {
        answerAccount()
        launch()
        openAnna()
        val reads = me.dayRequests.size

        openCancelForm()
        compose.onNodeWithTag(CancelSessionTags.WHO_WORKSPACE).performClick()
        compose.waitUntilTagExists(CancelSessionTags.NOTIFY)
        compose.onNodeWithTag(CancelSessionTags.SUBMIT).performClick()

        // PS-06 closes on TD-02, which says it is done and shows who cancelled and when.
        compose.waitUntilTagExists(SessionTags.CANCELLED)
        compose.onNodeWithTag(SessionTags.CANCEL_DONE).assertTextEquals(string(R.string.sessions_cancel_done))
        val text = textOf(SessionTags.CANCELLED)
        val byClient = string(R.string.sessions_page_cancelled_by_client)
        assertTrue(text, text.contains("Sarah") && text.contains("10:12") && !text.contains(byClient))
        assertEquals(
            CancelPrivateSessionRequest(
                CancelPrivateSessionRequest.Initiator.WORKSPACE,
                notify = true,
                version = 1,
                surface = CancelPrivateSessionRequest.Surface.ANDROID,
            ),
            sessions.cancelled.single().third,
        )
        // A cancelled session has no *Annuleren* and no *Verplaatsen* any more.
        compose.onNodeWithTag(SessionTags.MENU).performClick()
        compose.waitUntilTagExists(SessionTags.CLIENT_PROFILE)
        assertTrue(!exists(SessionTags.CANCEL) && !exists(SessionTags.RESCHEDULE))
        // Vandaag read the day again as soon as the session was cancelled, with no trip through the background.
        waitUntil("Vandaag read again") { me.dayRequests.size > reads }
    }

    @Test
    fun test_F026_AC3_cancelledSessionStruckThrough() {
        answerAccount()
        launch()
        openAnna()
        openCancelForm()
        compose.onNodeWithTag(CancelSessionTags.WHO_WORKSPACE).performClick()
        compose.onNodeWithTag(CancelSessionTags.SUBMIT).performClick()
        compose.waitUntilTagExists(SessionTags.CANCELLED)

        // Vandaag: the session stays, marked *Geannuleerd* and struck through, and is no longer the next one.
        app.pressBack()
        compose.waitUntilTagExists(TodayTags.TITLE)
        val row = TodayTags.row(annaId)
        compose.waitUntilTagExists(row)
        waitUntil("the row says cancelled") {
            compose.onNodeWithTag(row).names().contains(string(R.string.my_day_cancelled))
        }

        // Agenda: the same session in the week.
        compose.onNodeWithTag(ProTab.CALENDAR.tag).performClick()
        compose.waitUntilTagExists(AgendaTags.TITLE)
        val entry = "${AgendaTags.ROWS}.row.$annaId"
        compose.waitUntilTagExists(entry)
        waitUntil("the entry says cancelled") {
            compose.onNodeWithTag(entry, useUnmergedTree = true).names().contains(string(R.string.my_day_cancelled))
        }
    }

    @Test
    fun test_F026_AC4_cancelDisabledOffline() {
        answerAccount()
        connectivity.setOnline(false)
        launch()
        openAnna()

        // Offline by the network, before any request: the item is off and the line says so.
        compose.onNodeWithTag(SessionTags.CANCEL_OFFLINE).assertTextEquals(string(R.string.sessions_cancel_offline))
        compose.onNodeWithTag(SessionTags.MENU).performClick()
        compose.waitUntilTagExists(SessionTags.CANCEL)
        compose.onNodeWithTag(SessionTags.CANCEL).assertIsNotEnabled()
        assertTrue(sessions.cancelled.isEmpty())

        // Back online, the item is on again and the line is gone.
        connectivity.setOnline(true)
        waitUntil("the line is gone") { !exists(SessionTags.CANCEL_OFFLINE) }
        compose.onNodeWithTag(SessionTags.CANCEL).assertIsEnabled()
    }

    @Test
    fun test_F026_AC4_aRequestThatCannotReachTheApiTurnsTheItemOffToo() {
        answerAccount()
        launch()
        openAnna()
        openCancelForm()
        compose.onNodeWithTag(CancelSessionTags.WHO_WORKSPACE).performClick()
        sessions.failure = IOException("offline")

        compose.onNodeWithTag(CancelSessionTags.SUBMIT).performClick()

        compose.waitUntilTagExists(CancelSessionTags.FAILED)
        compose.onNodeWithTag(CancelSessionTags.FAILED).assertTextEquals(string(R.string.sessions_cancel_offline))
        compose.onNodeWithTag(CancelSessionTags.SUBMIT).assertIsNotEnabled()
        compose.onNodeWithTag(CancelSessionTags.BACK).performClick()
        compose.waitUntilTagExists(SessionTags.CANCEL_OFFLINE)
        compose.onNodeWithTag(SessionTags.MENU).performClick()
        compose.waitUntilTagExists(SessionTags.CANCEL)
        compose.onNodeWithTag(SessionTags.CANCEL).assertIsNotEnabled()
    }

    @Test
    fun test_F026_AC5_aTrainerCancelsTheirOwnSessionsOnly() {
        answerAccount(
            role = MeWorkspace.Role.TRAINER,
            capabilities = listOf(
                MeWorkspace.Capabilities.CLIENTS_PERIOD_VIEW,
                MeWorkspace.Capabilities.SESSION_PERIOD_PRIVATE_PERIOD_MANAGE_PERIOD_OWN,
                MeWorkspace.Capabilities.SESSION_PERIOD_PRIVATE_PERIOD_CANCEL_PERIOD_OWN,
            ),
        )
        launch()
        // Sarah's own session has *Annuleren*.
        openAnna()
        compose.onNodeWithTag(SessionTags.MENU).performClick()
        compose.waitUntilTagExists(SessionTags.CANCEL)
        app.pressBack()
        app.pressBack()

        // Tom's has not.
        openRow(markId)
        compose.waitUntilTagExists(SessionTags.WORKSPACE)
        compose.onNodeWithTag(SessionTags.MENU).performClick()
        compose.waitUntilTagExists(SessionTags.CLIENT_PROFILE)
        assertTrue(!exists(SessionTags.CANCEL))
    }

    @Test
    fun test_F026_design_cancelClassFromTheMenuAfterTheConfirmation() {
        answerAccount()
        launch()
        openRow(krachtId)
        compose.waitUntilTagExists(ClassDateTags.MENU)

        compose.onNodeWithTag(ClassDateTags.MENU).performClick()
        compose.waitUntilTagExists(ClassDateTags.CANCEL)
        compose.onNodeWithTag(ClassDateTags.CANCEL).performClick()

        // The confirmation says how many booked clients get an email, and nothing is cancelled before it is confirmed.
        compose.waitUntilTagExists(ClassDateTags.CANCEL_SUBMIT)
        assertTrue(classes.cancelled.isEmpty())
        compose.onNodeWithTag(ClassDateTags.CANCEL_BACK).performClick()
        waitUntil("the confirmation is gone") { !exists(ClassDateTags.CANCEL_SUBMIT) }
        assertTrue(classes.cancelled.isEmpty())

        compose.onNodeWithTag(ClassDateTags.MENU).performClick()
        compose.waitUntilTagExists(ClassDateTags.CANCEL)
        compose.onNodeWithTag(ClassDateTags.CANCEL).performClick()
        compose.waitUntilTagExists(ClassDateTags.CANCEL_SUBMIT)
        compose.onNodeWithTag(ClassDateTags.CANCEL_SUBMIT).performClick()

        // This date only, with the version seen; TD-03 shows the cancelled banner and no menu.
        compose.waitUntilTagExists(ClassDateTags.CANCELLED)
        val (_, id, request) = classes.cancelled.single()
        assertEquals(krachtId, id)
        assertEquals(CancelClassDateRequest.Scope.THIS, request.scope)
        assertEquals(CancelClassDateRequest.Surface.ANDROID, request.surface)
        assertEquals(Session.Status.CANCELLED, sessions.sessions.getValue(krachtId).status)
        waitUntil("the menu is gone") { !exists(ClassDateTags.MENU) }
    }

    @Test
    fun test_F026_AC4_theClassItemIsOffOfflineAndATrainerHasNone() {
        answerAccount()
        connectivity.setOnline(false)
        launch()
        openRow(krachtId)
        compose.waitUntilTagExists(ClassDateTags.MENU)

        compose.onNodeWithTag(
            ClassDateTags.CANCEL_OFFLINE,
        ).assertTextEquals(string(R.string.classes_app_cancel_offline))
        compose.onNodeWithTag(ClassDateTags.MENU).performClick()
        compose.waitUntilTagExists(ClassDateTags.CANCEL)
        compose.onNodeWithTag(ClassDateTags.CANCEL).assertIsNotEnabled()
    }

    @Test
    fun test_F026_AC5_aTrainerWithoutClassManageHasNoMenuAndSoNoCancelClass() {
        answerAccount(
            role = MeWorkspace.Role.TRAINER,
            capabilities = listOf(MeWorkspace.Capabilities.CLASS_PERIOD_READ),
        )
        launch()
        openRow(krachtId)

        compose.waitUntilTagExists(ClassDateTags.TITLE)
        assertTrue(!exists(ClassDateTags.MENU))
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}

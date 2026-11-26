package app.fivvi.pro.attendance

import app.fivvi.api.models.PersonalSessionClient
import app.fivvi.core.net.FakeConnectivity
import app.fivvi.pro.personal.MemoryPersonalStore
import app.fivvi.pro.personal.PersonalFixtures
import app.fivvi.pro.personal.PersonalRows
import app.fivvi.pro.personal.TodayContent
import app.fivvi.pro.sessions.FakeSessionsApi
import app.fivvi.pro.sessions.SessionFormat
import java.util.Locale
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

// F025's nudge on TD-01 *Vandaag* (Q18, AC2) and the *Te doen* row of the *Mijn dag* card: the API says which sessions wait
// for attendance (`attendanceOpen`: ended, takes place, a participant still *Geboekt*); the phone only leaves out what it has
// answered already (a tap waiting in the queue, or the queue's last answer saying nobody is open any more).
@OptIn(ExperimentalCoroutinesApi::class)
class AttendanceNudgesTest {
    private val api = FakeSessionsApi()
    private val server get() = api.attendance
    private val phone = FakeConnectivity()
    private val workspace = PersonalFixtures.johns.id
    private val anna = participantIdOf("Anna de Vries")
    private val session = PersonalFixtures.sessionIdOf("anna")
    private val format = SessionFormat(Locale.forLanguageTag("nl-NL"), PersonalRows.TIME_ZONE)

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        server.add(
            FakeAttendance(
                session,
                type = app.fivvi.api.models.Attendance.Type.PRIVATE,
                opensAt = FakeAttendanceServer.at(PersonalFixtures.at("08:30").toInstant()),
                participants = mutableListOf(FakeAttendanceServer.participant("Anna de Vries")),
            ),
        )
        server.now = PersonalFixtures.at("10:05").toInstant()
    }

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun queue(online: FakeConnectivity = phone) =
        AttendanceQueue(api, MemoryPersonalStore(), online, retryAfter = null).also { it.adopt("sarah") }

    private val clients = listOf(PersonalSessionClient(anna, "Anna de Vries"))

    private fun nudges(queue: AttendanceQueue) = AttendanceNudges(queue.state.value)

    @Test
    fun test_F025_AC2_anEndedPrivateSessionWithItsClientStillBookedShowsTheNudge() {
        val nudge = nudges(queue()).nudge(session, attendanceOpen = true, isPrivate = true, clients = clients)

        assertNotNull(nudge)
        assertEquals(anna, nudge?.clientId)
        assertEquals("Anna de Vries", nudge?.clientName)
        assertFalse(nudge?.isWaiting == true)
        assertNull(nudge?.refusal)
    }

    @Test
    fun test_F025_AC2_noNudgeWhileTheSessionIsOnOrWhenTheApiSaysNothingIsOpen() {
        val nudges = nudges(queue())

        assertNull(
            "09:50, during the session: the API sends no attendanceOpen",
            nudges.nudge(session, null, true, clients),
        )
        assertNull(nudges.nudge(session, false, true, clients))
        assertFalse(nudges.isOpen(session, null))
    }

    @Test
    fun test_F025_AC2_aTapOnTheNudgeSetsNoShowAndTheNudgeGoes() {
        val queue = queue()
        val nudges = nudges(queue)
        queue.enqueue(workspace, session, QueueAction.Set(anna, AttendanceStatus.NO_SHOW))

        assertEquals(1, server.sent.size)
        assertEquals(app.fivvi.api.models.SetAttendanceRequest.Status.NO_SHOW, server.sent.single().status)
        val after = nudges(queue)
        assertNull("the answer says nobody is open any more", after.nudge(session, true, true, clients))
        assertFalse(after.isOpen(session, true))
    }

    @Test
    fun test_F025_aTapWaitingForTheConnectionKeepsTheRowSayingSoAndHidesTheButtons() {
        val offline = FakeConnectivity(false)
        val queue = queue(offline)
        queue.enqueue(workspace, session, QueueAction.Set(anna, AttendanceStatus.ATTENDED))

        val nudge = nudges(queue).nudge(session, true, true, clients)

        assertTrue(nudge?.isWaiting == true)
        assertFalse(
            "the session is not nudged again as open for the Te doen chips",
            nudges(queue).isOpen(session, true),
        )
    }

    @Test
    fun test_F025_aTapOnItsWayWithThePhoneOnlineTakesTheNudgeAwayAtOnce() {
        val gate = kotlinx.coroutines.CompletableDeferred<Unit>()
        server.answers.add {
            gate.await()
            FakeAttendanceServer.status(503)
        }
        val queue = queue()

        queue.enqueue(workspace, session, QueueAction.Set(anna, AttendanceStatus.ATTENDED))

        assertNull(
            "sent, not stalled, the phone online: the row does not nudge",
            nudges(queue).nudge(session, true, true, clients),
        )
        gate.complete(Unit)
        assertTrue(
            "the server failed: the tap waits and the row says so",
            nudges(queue).nudge(session, true, true, clients)?.isWaiting == true,
        )
    }

    @Test
    fun test_F025_aTapTheApiRefusedBringsTheButtonsBackWithItsReason() {
        val offline = FakeConnectivity(false)
        val queue = queue(offline)
        queue.enqueue(workspace, session, QueueAction.Set(anna, AttendanceStatus.ATTENDED))
        server.sessions.getValue(session).cancelled = true
        offline.setOnline(true)

        val nudge = nudges(queue).nudge(session, true, true, clients)

        assertEquals(Reason.SessionCancelled, nudge?.refusal)
        assertFalse(nudge?.isWaiting == true)
    }

    @Test
    fun test_F025_aDuoAndAClassHaveTheLineAlone() {
        val nudges = nudges(queue())
        val duo = clients + PersonalSessionClient(UUID.randomUUID(), "Eva Kok")

        assertNull("a duo has no inline buttons", nudges.nudge(session, true, true, duo))
        assertTrue(nudges.isOpen(session, true))
        assertNull("nor does a class", nudges.nudge(session, true, false, null))
    }

    @Test
    fun test_F025_theMijnDagCardListsEachEndedItemStillOpenAsAChipAndSaysAllCaughtUpWhenNone() {
        val kracht = PersonalFixtures.session(
            "kracht-evening",
            PersonalFixtures.johns,
            "18:00",
            "19:00",
            className = "Kracht",
            booked = 7,
            capacity = 8,
            attendanceOpen = true,
        )
        val annaItem = PersonalFixtures.session(
            "anna",
            PersonalFixtures.johns,
            "09:00",
            "10:00",
            client = "Anna de Vries",
            attendanceOpen = true,
            clientId = anna,
        )
        val day = PersonalFixtures.sarah(items = listOf(annaItem, kracht), workspaceCount = 1).copy(next = null)
        val queue = queue()

        val content =
            TodayContent(day, PersonalFixtures.at("19:30").toInstant(), format, AttendanceNudges(queue.state.value))
        val todo = requireNotNull(content.card).todo
        assertEquals(listOf("Anna", "Kracht"), todo.chips.map { it.who })
        assertEquals(listOf("09:00", "18:00"), todo.chips.map { it.row.startText })
        assertEquals("a chip opens TD-02 or TD-03", listOf(false, true), todo.chips.map { it.row.isGroup })

        // Anna's no-show is sent: the answer says nobody is left open there; the chip and the nudge go.
        queue.enqueue(workspace, session, QueueAction.Set(anna, AttendanceStatus.NO_SHOW))
        val after =
            TodayContent(day, PersonalFixtures.at("19:30").toInstant(), format, AttendanceNudges(queue.state.value))
        assertEquals(listOf("Kracht"), requireNotNull(after.card).todo.chips.map { it.who })
        assertNull(after.rows.first { it.id == session }.nudge)
        assertTrue("an ended class has the line that opens CO-05", after.rows.first { it.isGroup }.attendanceLine)

        // A fresh read of the day has the answers: nothing is settled any more, and the API's word decides.
        queue.forgetSettled()
        val fresh = TodayContent(
            PersonalFixtures.sarah(
                items = listOf(annaItem.copy(attendanceOpen = null), kracht.copy(attendanceOpen = null)),
                workspaceCount = 1,
            )
                .copy(next = null),
            PersonalFixtures.at("19:30").toInstant(),
            format,
            AttendanceNudges(queue.state.value),
        )
        assertTrue(requireNotNull(fresh.card).todo.chips.isEmpty())
    }

    @Test
    fun test_F025_withoutAQueueTheDayHasNoNudgesAndTheCardSaysAllCaughtUp() {
        val day = PersonalFixtures.sarah(workspaceCount = 1)

        val content = TodayContent(day, PersonalFixtures.now, format)

        assertTrue(requireNotNull(content.card).todo.chips.isEmpty())
        assertTrue(content.rows.all { it.nudge == null && !it.attendanceLine })
    }
}

package app.fivvi.pro.attendance

import app.fivvi.api.models.AttendanceParticipant
import app.fivvi.core.net.FakeConnectivity
import app.fivvi.pro.attendance.FakeAttendanceServer.Companion.participant
import app.fivvi.pro.classes.classDateOf
import app.fivvi.pro.classes.groupClassOf
import app.fivvi.pro.personal.MemoryPersonalStore
import app.fivvi.pro.sessions.FakeSessionsApi
import java.io.IOException
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

// CO-05 and TD-02's attendance (F025, AC1, AC4, AC5, AC6): what the API says, with the requests still waiting in the queue laid
// over it, so a row shows what the person tapped at once. The words are the catalog's and are checked, in nl-NL and en, by the
// Compose UI tests; here is what the screens are made of.
@OptIn(ExperimentalCoroutinesApi::class)
class AttendanceViewModelTest {
    private val api = FakeSessionsApi()
    private val server get() = api.attendance
    private val phone = FakeConnectivity()
    private val workspace = UUID.nameUUIDFromBytes("workspace".toByteArray())
    private val kracht = UUID.nameUUIDFromBytes("kracht".toByteArray())
    private val opensAt = Instant.parse("2026-09-22T15:30:00Z")
    private var clock = Instant.parse("2026-09-22T16:10:00Z")
    private val names =
        listOf("Anna de Vries", "Bram Jansen", "Chris Bakker", "Dana Smit", "Eva Bos", "Fenna Kok", "Gijs Mol")

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        server.add(
            FakeAttendance(
                kracht,
                opensAt = FakeAttendanceServer.at(opensAt),
                participants = names.map { participant(it) }.toMutableList(),
            ),
        )
        server.now = clock
    }

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun queue() =
        AttendanceQueue(api, MemoryPersonalStore(), phone, retryAfter = null, io = Dispatchers.Unconfined)
            .also { it.adopt("sarah") }

    private fun model(queue: AttendanceQueue, onForbidden: () -> Unit = {}) =
        AttendanceViewModel(api, workspace, kracht, queue, { clock }, onForbidden)

    private fun id(name: String) = participantIdOf(name)

    @Test
    fun test_F025_AC4_theSummaryUpdatesAfterEachTap() {
        val queue = queue()
        val model = model(queue)
        assertEquals(AttendanceLoad.Loaded, model.state.value.load)
        assertEquals(Summary(0, 0, 7, 0), model.view().summary)

        names.take(5).forEach { model.toggle(AttendanceStatus.ATTENDED, id(it)) }
        assertEquals(Summary(5, 0, 2, 0), model.view().summary)

        model.toggle(AttendanceStatus.NO_SHOW, id("Fenna Kok"))
        assertEquals("5 attended, 1 no-show, 1 open", Summary(5, 1, 1, 0), model.view().summary)
    }

    @Test
    fun test_F025_AC4_aTapWaitingInTheQueueIsShownAtOnceAndMarkedWaiting() {
        phone.setOnline(false)
        val queue = queue()
        val model = model(queue)

        model.toggle(AttendanceStatus.ATTENDED, id("Anna de Vries"))

        val row = model.view().rows.first()
        assertEquals(AttendanceStatus.ATTENDED, row.status)
        assertTrue(row.isPending)
        assertTrue(model.view().rowsWaitForConnection)
        assertEquals(
            "the API still has her booked",
            AttendanceParticipant.Status.BOOKED,
            server.sessions.getValue(kracht).participants[0].status,
        )
    }

    @Test
    fun test_F025_tappingTheSelectedButtonAgainTakesTheTapBack() {
        val queue = queue()
        val model = model(queue)
        model.toggle(AttendanceStatus.ATTENDED, id("Anna de Vries"))
        model.toggle(AttendanceStatus.ATTENDED, id("Anna de Vries"))

        assertEquals(AttendanceStatus.BOOKED, model.view().rows.first().status)
        assertEquals(
            listOf(
                app.fivvi.api.models.SetAttendanceRequest.Status.ATTENDED,
                app.fivvi.api.models.SetAttendanceRequest.Status.BOOKED,
            ),
            server.sent.map { it.status },
        )
    }

    @Test
    fun test_F025_everyoneAttendedLeavesNoShowAndCancelledParticipantsAsTheyAre() {
        server.sessions.getValue(kracht).participants[0] =
            participant("Anna de Vries", AttendanceParticipant.Status.NO_SHOW)
        server.sessions.getValue(kracht).participants[6] =
            participant("Gijs Mol", AttendanceParticipant.Status.CANCELLED)
        phone.setOnline(false)
        val queue = queue()
        val model = model(queue)
        assertTrue(model.view().canMarkEveryone)

        model.markEveryone()

        val view = model.view()
        assertEquals(1, queue.state.value.entries.size)
        assertEquals(
            listOf("Bram Jansen", "Chris Bakker", "Dana Smit", "Eva Bos", "Fenna Kok").map(::id),
            queue.state.value.entries.single().action.clientIds,
        )
        assertEquals(AttendanceStatus.NO_SHOW, view.rows[0].status)
        assertEquals(AttendanceStatus.CANCELLED, view.rows[6].status)
        assertTrue(
            "the 5 open rows show Aanwezig and wait",
            view.rows.subList(1, 6).all {
                it.status ==
                    AttendanceStatus.ATTENDED &&
                    it.isPending
            },
        )
        assertEquals(Summary(5, 1, 0, 1), view.summary)
        assertFalse("nothing is open any more", view.canMarkEveryone)
    }

    @Test
    fun test_F025_AC5_beforeTheWindowTheButtonsAreOffAndTheTimeIsKnown() {
        clock = Instant.parse("2026-09-22T15:20:00Z")
        val queue = queue()
        val model = model(queue)
        val view = model.view()

        assertTrue(view.isTooEarly)
        assertFalse(view.canMark)
        assertEquals(opensAt, view.opensAt)
        model.toggle(AttendanceStatus.ATTENDED, id("Anna de Vries"))
        assertTrue("a tap before the window queues nothing", queue.state.value.entries.isEmpty())
        // Time passes: 17:30 in Amsterdam, the window is open.
        clock = Instant.parse("2026-09-22T15:30:00Z")
        assertTrue(model.view().canMark)
    }

    @Test
    fun test_F025_AC6_aCancelledSessionHasNoButtonsAndACancelledParticipantIsReadOnly() {
        server.sessions.getValue(kracht).participants[2] =
            participant("Chris Bakker", AttendanceParticipant.Status.CANCELLED)
        server.sessions.getValue(kracht).cancelled = true
        val queue = queue()
        val model = model(queue)
        val view = model.view()

        assertTrue(view.isCancelled)
        assertFalse(view.canMark)
        assertFalse(view.canMarkEveryone)
        model.markEveryone()
        assertTrue(queue.state.value.entries.isEmpty())

        server.sessions.getValue(kracht).cancelled = false
        model.refresh()
        model.toggle(AttendanceStatus.ATTENDED, id("Chris Bakker"))
        assertTrue("a participant who cancelled cannot be set", queue.state.value.entries.isEmpty())
    }

    @Test
    fun test_F025_AC9_aRefusedTapRevertsTheRowAndKeepsTheReason() {
        phone.setOnline(false)
        val queue = queue()
        val model = model(queue)
        model.toggle(AttendanceStatus.ATTENDED, id("Anna de Vries"))
        server.sessions.getValue(kracht).cancelled = true
        phone.setOnline(true)

        val row = model.view().rows.first()
        assertEquals(AttendanceStatus.BOOKED, row.status)
        assertFalse(row.isPending)
        assertEquals(Reason.SessionCancelled, row.refusal)
        assertEquals("the screen reads again when a request is refused", 1, model.view().refusals)
    }

    @Test
    fun test_F025_theQueuesLastAnswerShowsUnderTheWaitingRequests() {
        val queue = queue()
        val model = model(queue)
        model.toggle(AttendanceStatus.ATTENDED, id("Anna de Vries"))
        // Someone else marked Bram on another device: the API's answer to Sarah's tap has it.
        server.sessions.getValue(kracht).participants[1] =
            participant("Bram Jansen", AttendanceParticipant.Status.NO_SHOW)
        model.toggle(AttendanceStatus.ATTENDED, id("Chris Bakker"))

        assertEquals(AttendanceStatus.NO_SHOW, model.view().rows[1].status)
    }

    @Test
    fun test_F025_aSessionTheApiRefusesIsNoPermissionAndAForbiddenIsTold() {
        var told = 0
        server.listStatus = 403
        val queue = queue()
        val model = model(queue) { told++ }

        assertEquals(AttendanceLoad.NoPermission, model.state.value.load)
        assertEquals(1, told)
    }

    @Test
    fun test_F025_AC4_co05NamesTheClassAndItsTime() {
        api.sessions[kracht] = classDateOf(
            kracht,
            groupClassOf("Kracht", nameEn = "Strength"),
            start = java.time.LocalDateTime.of(2026, 9, 22, 18, 0),
        )
        val model = AttendanceViewModel(api, workspace, kracht, queue(), { clock }, withHeader = true)

        val header = requireNotNull(model.state.value.header)
        assertEquals("Kracht", header.nameNl)
        assertEquals("Strength", header.nameEn)
        assertEquals(opensAt.plusSeconds(30 * 60), header.startsAt.toInstant())
        assertEquals("Europe/Amsterdam", header.zone.id)
        assertNull("TD-02 reads no header", model(queue()).state.value.header)
    }

    @Test
    fun test_F025_aFailedReadKeepsWhatIsOnScreen() {
        val queue = queue()
        val model = model(queue)
        server.failure = IOException("no route")
        model.refresh()

        assertEquals(AttendanceLoad.Loaded, model.state.value.load)
        assertEquals(7, model.view().rows.size)

        val fresh = model(queue)
        assertEquals(AttendanceLoad.Failed, fresh.state.value.load)
        server.failure = null
        fresh.retry()
        assertEquals(AttendanceLoad.Loaded, fresh.state.value.load)
    }
}

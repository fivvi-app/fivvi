package app.fivvi.pro.attendance

import app.fivvi.api.models.AttendanceParticipant
import app.fivvi.api.models.SetAttendanceRequest
import app.fivvi.core.net.FakeConnectivity
import app.fivvi.pro.attendance.FakeAttendanceServer.Companion.participant
import app.fivvi.pro.personal.MemoryPersonalStore
import app.fivvi.pro.sessions.FakeSessionsApi
import java.io.IOException
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

// F025's offline queue (spec #460, AC8, AC9, and the owner's decision of 9 November 2026 on *Iedereen aanwezig*): every tap is
// a request with a client request ID of its own, kept in a file and sent in order; a refusal leaves the queue with its reason.
@OptIn(ExperimentalCoroutinesApi::class)
class AttendanceQueueTest {
    private val api = FakeSessionsApi()
    private val server get() = api.attendance
    private val store = MemoryPersonalStore()
    private val connectivity = FakeConnectivity()
    private val workspace = UUID.nameUUIDFromBytes("workspace".toByteArray())
    private val kracht = UUID.nameUUIDFromBytes("kracht".toByteArray())
    private val names = listOf("Anna de Vries", "Bram Jansen", "Chris Bakker")
    private var signedIn = true

    // The sign-in the next queue is made under: a restart of the app keeps it, another sign-in changes it.
    private var signIn = "sign-in-1"

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        server.add(
            FakeAttendance(
                kracht,
                opensAt = FakeAttendanceServer.at(Instant.parse("2026-09-22T15:30:00Z")),
                participants = names.map { participant(it) }.toMutableList(),
            ),
        )
        server.now = Instant.parse("2026-09-22T16:10:00Z")
    }

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun queue(
        account: String? = "sarah",
        online: FakeConnectivity = connectivity,
        store: MemoryPersonalStore = this.store,
    ) = AttendanceQueue(
        api,
        store,
        online,
        signIn,
        stillSignedIn = { signedIn },
        retryAfter = null,
        io = Dispatchers.Unconfined,
    ).also {
        if (account != null) it.adopt(account)
    }

    private fun AttendanceQueue.tap(name: String, status: AttendanceStatus) =
        enqueue(workspace, kracht, QueueAction.Set(participantIdOf(name), status))

    @Test
    fun test_F025_AC8_offlineQueueSurvivesRestartAndSyncsInOrder() {
        val closed = FakeConnectivity(false)
        val first = queue(online = closed)
        first.tap("Anna de Vries", AttendanceStatus.ATTENDED)
        first.tap("Bram Jansen", AttendanceStatus.NO_SHOW)
        first.tap("Chris Bakker", AttendanceStatus.ATTENDED)
        assertEquals("nothing is sent offline", emptyList<SentAttendance>(), server.sent)
        assertTrue(first.state.value.waitsForConnection)

        // The app is closed and opened again: a second queue reads the file.
        val phone = FakeConnectivity(false)
        val second = queue(online = phone)
        assertEquals(3, second.state.value.entries.size)
        phone.setOnline(true)

        assertEquals(
            listOf("Anna de Vries", "Bram Jansen", "Chris Bakker").map(::participantIdOf),
            server.sent.map { it.clientId },
        )
        assertEquals(
            listOf(
                SetAttendanceRequest.Status.ATTENDED,
                SetAttendanceRequest.Status.NO_SHOW,
                SetAttendanceRequest.Status.ATTENDED,
            ),
            server.sent.map { it.status },
        )
        assertEquals("every tap has its own request ID", 3, server.sent.map { it.requestId }.toSet().size)
        assertEquals("android", server.sent.first().surface)
        assertTrue(second.state.value.entries.isEmpty())
        assertTrue(!second.state.value.waitsForConnection)
        assertTrue(
            "the file is empty once everything is sent",
            queue(online = FakeConnectivity(false)).state.value.entries.isEmpty(),
        )
    }

    @Test
    fun test_F025_AC8_aTapSentAgainKeepsItsRequestID() {
        server.failure = IOException("no route")
        val queue = queue()
        queue.tap("Anna de Vries", AttendanceStatus.ATTENDED)
        assertTrue("the tap stays and the queue says it waits", queue.state.value.waitsForConnection)
        server.failure = null

        queue.flush()

        assertEquals(2, server.sent.size)
        assertEquals(listOf(participantIdOf("Anna de Vries")), server.sent.map { it.clientId }.distinct())
        assertEquals("the second try carries the ID of the first", server.sent[0].requestId, server.sent[1].requestId)
        assertTrue(queue.state.value.entries.isEmpty())
        assertEquals(AttendanceParticipant.Status.ATTENDED, server.sessions.getValue(kracht).participants[0].status)
    }

    @Test
    fun test_F025_AC9_refusedQueuedTapRevertsWithTheReason() {
        connectivity.setOnline(false)
        val queue = queue()
        queue.tap("Anna de Vries", AttendanceStatus.ATTENDED)
        server.sessions.getValue(kracht).cancelled = true
        connectivity.setOnline(true)

        val state = queue.state.value
        assertTrue(state.entries.isEmpty())
        assertEquals(Reason.SessionCancelled, state.rejections.single().reason)
        assertEquals(listOf(participantIdOf("Anna de Vries")), state.rejections.single().clientIds)
        assertEquals(1, state.revision)
    }

    @Test
    fun test_F025_AC6_refusalsAreMappedToReasons() {
        val queue = queue()
        server.sessions.getValue(kracht).participants[1] =
            participant("Bram Jansen", AttendanceParticipant.Status.CANCELLED)
        queue.tap("Bram Jansen", AttendanceStatus.ATTENDED)
        assertEquals(Reason.ParticipantCancelled, queue.state.value.rejections.last().reason)

        server.now = Instant.parse("2026-09-22T15:00:00Z")
        queue.tap("Anna de Vries", AttendanceStatus.ATTENDED)
        assertEquals(Reason.TooEarly(Instant.parse("2026-09-22T15:30:00Z")), queue.state.value.rejections.last().reason)
        assertTrue(queue.state.value.entries.isEmpty())
    }

    @Test
    fun test_F025_aRefusalTheContractDoesNotListNeverStallsTheQueue() {
        val queue = queue()
        server.answers.add { FakeAttendanceServer.status(418) }
        queue.tap("Anna de Vries", AttendanceStatus.ATTENDED)
        assertEquals(Reason.Other, queue.state.value.rejections.single().reason)
        assertTrue("the entry left the queue", queue.state.value.entries.isEmpty())
        assertTrue(!queue.state.value.waitsForConnection)

        // A 404 and a body that cannot be read are refusals too, the next tap goes through.
        server.answers.add { FakeAttendanceServer.status(404) }
        queue.tap("Bram Jansen", AttendanceStatus.ATTENDED)
        server.answers.add { throw kotlinx.serialization.SerializationException("not an attendance") }
        queue.tap("Chris Bakker", AttendanceStatus.ATTENDED)
        assertEquals(listOf(Reason.Other, Reason.Other, Reason.Other), queue.state.value.rejections.map { it.reason })
        assertTrue(queue.state.value.entries.isEmpty())
    }

    @Test
    fun test_F025_aServerErrorIsSentAgainAndTheTapsBehindItWait() {
        val queue = queue()
        server.answers.add { FakeAttendanceServer.status(503) }
        server.answers.add { FakeAttendanceServer.status(503) }
        queue.tap("Anna de Vries", AttendanceStatus.ATTENDED)
        queue.tap("Bram Jansen", AttendanceStatus.NO_SHOW)
        assertEquals(2, queue.state.value.entries.size)
        assertTrue(queue.state.value.waitsForConnection)
        assertEquals(
            "the second tap is not sent past the first",
            2,
            server.sent.count {
                it.clientId ==
                    participantIdOf("Anna de Vries")
            },
        )
        assertEquals(0, server.sent.count { it.clientId == participantIdOf("Bram Jansen") })

        queue.flush()

        assertTrue(queue.state.value.entries.isEmpty())
        assertTrue(!queue.state.value.waitsForConnection)
        assertEquals(
            listOf("Anna de Vries", "Anna de Vries", "Anna de Vries", "Bram Jansen").map(::participantIdOf),
            server.sent.map { it.clientId },
        )
        assertEquals("every try has the ID of the first", 1, server.sent.take(3).map { it.requestId }.toSet().size)
    }

    @Test
    fun test_F025_everyoneAttendedOfflineIsOneRequestInOrderWithTheTapsAroundIt() {
        connectivity.setOnline(false)
        val queue = queue()
        queue.tap("Bram Jansen", AttendanceStatus.NO_SHOW)
        queue.enqueue(
            workspace,
            kracht,
            QueueAction.Everyone(listOf(participantIdOf("Anna de Vries"), participantIdOf("Chris Bakker"))),
        )
        queue.tap("Anna de Vries", AttendanceStatus.BOOKED)
        assertEquals(3, queue.state.value.entries.size)

        queue.let { connectivity.setOnline(true) }

        assertEquals(
            listOf(participantIdOf("Bram Jansen"), null, participantIdOf("Anna de Vries")),
            server.sent.map {
                it.clientId
            },
        )
        assertEquals(
            listOf(
                AttendanceParticipant.Status.BOOKED,
                AttendanceParticipant.Status.NO_SHOW,
                AttendanceParticipant.Status.ATTENDED,
            ).sorted(),
            server.sessions.getValue(kracht).participants.map { it.status }.sorted(),
        )
    }

    @Test
    fun test_F025_theLastAnswerOfTheServerIsKeptForTheScreensUntilTheyReadAgain() {
        val queue = queue()
        queue.tap("Anna de Vries", AttendanceStatus.ATTENDED)
        assertEquals(2, queue.state.value.answers.getValue(kracht).summary.open)
        assertEquals(2, queue.state.value.settled.getValue(kracht))

        queue.forgetAnswer(kracht)
        queue.forgetSettled()

        assertNull(queue.state.value.answers[kracht])
        assertTrue(queue.state.value.settled.isEmpty())
    }

    // #1618: signing out, after the warning, empties the queue in memory and on disk.
    @Test
    fun test_F025_1618_signingOutEmptiesTheQueueInMemoryAndOnDisk() {
        connectivity.setOnline(false)
        val queue = queue()
        queue.tap("Anna de Vries", AttendanceStatus.ATTENDED)
        queue.tap("Bram Jansen", AttendanceStatus.NO_SHOW)

        queue.clear()

        assertTrue(queue.state.value.entries.isEmpty())
        assertTrue(
            "nothing is left on disk for the next sign-in",
            queue(online = FakeConnectivity(false)).state.value.entries.isEmpty(),
        )
    }

    // #1618: a send that is still running while the person signs out does not write the taps back.
    @Test
    fun test_F025_1618_aSendStillRunningAtSignOutDoesNotWriteTheTapsBack() {
        val gate = CompletableDeferred<Unit>()
        val queue = queue()
        server.answers.add {
            gate.await()
            FakeAttendanceServer.status(503)
        }
        queue.tap("Anna de Vries", AttendanceStatus.ATTENDED)
        queue.tap("Bram Jansen", AttendanceStatus.NO_SHOW)
        assertEquals(2, queue.state.value.entries.size)

        queue.clear()
        gate.complete(Unit)

        assertTrue(queue.state.value.entries.isEmpty())
        assertTrue("the file stays empty", queue(online = FakeConnectivity(false)).state.value.entries.isEmpty())
        assertEquals("the second tap was never sent", 1, server.sent.size)
    }

    // #1618: no tap of the earlier account is sent once someone else signs in on the phone.
    @Test
    fun test_F025_1618_noTapOfTheEarlierAccountIsSentAfterAnotherSignIn() {
        queue(account = "sarah", online = FakeConnectivity(false)).tap("Anna de Vries", AttendanceStatus.ATTENDED)

        val next = queue(account = "john")

        assertTrue(next.state.value.entries.isEmpty())
        assertEquals(emptyList<SentAttendance>(), server.sent)
        assertTrue(
            "the earlier account's taps are gone from the file",
            queue(account = "sarah", online = FakeConnectivity(false)).state.value.entries.isEmpty(),
        )
    }

    // #1618: a 401 while taps wait keeps them (the file stays) until the same account signs in again; another account drops them.
    @Test
    fun test_F025_1618_aRejectedTokenKeepsTheTapsUntilTheSameAccountSignsInAgain() {
        val queue = queue(account = "sarah")
        server.answers.add { FakeAttendanceServer.status(401) }
        queue.tap("Anna de Vries", AttendanceStatus.ATTENDED)
        signedIn = false // the session ends: the queue sends no more
        queue.flush()
        assertEquals(1, server.sent.size)
        assertEquals(1, queue.state.value.entries.size)
        assertTrue(queue.state.value.rejections.isEmpty())

        signedIn = true
        signIn = "sign-in-2"
        val phone = FakeConnectivity(false)
        val sameAccount = queue(account = "sarah", online = phone)
        assertEquals("the tap is still there", 1, sameAccount.state.value.entries.size)
        phone.setOnline(true)

        assertEquals("and is sent once the same account is back", 2, server.sent.size)
        assertTrue(sameAccount.state.value.entries.isEmpty())
        assertEquals(AttendanceParticipant.Status.ATTENDED, server.sessions.getValue(kracht).participants[0].status)
    }

    @Test
    fun test_F025_1618_aRejectedTokenDoesNotHandTheTapsToAnotherAccount() {
        val queue = queue(account = "sarah")
        server.answers.add { FakeAttendanceServer.status(401) }
        queue.tap("Anna de Vries", AttendanceStatus.ATTENDED)

        signIn = "sign-in-2"
        val other = queue(account = "john")

        assertTrue(other.state.value.entries.isEmpty())
        assertEquals(1, server.sent.size)
    }

    @Test
    fun test_F025_aTapQueuedBeforeTheAccountIsKnownBelongsToThatSignIn() {
        connectivity.setOnline(false)
        val queue = queue(account = null)
        queue.tap("Anna de Vries", AttendanceStatus.ATTENDED)
        connectivity.setOnline(true)
        assertEquals("nothing is sent before the account is known", 0, server.sent.size)

        queue.adopt("sarah")

        assertEquals(1, server.sent.size)
        assertTrue(queue.state.value.entries.isEmpty())
    }

    // The queue file is read when the queue is made, not only when `GET /v1/me` answers: an app opened offline (or a tap that
    // comes before the answer) must not overwrite the taps that waited on the phone.
    @Test
    fun test_F025_1620_aTapBeforeTheAccountIsKnownKeepsTheTapsThatWaitedOnTheDisk() {
        val first = queue(online = FakeConnectivity(false))
        first.tap("Anna de Vries", AttendanceStatus.ATTENDED)
        first.tap("Bram Jansen", AttendanceStatus.NO_SHOW)
        first.tap("Chris Bakker", AttendanceStatus.ATTENDED)

        // The app is opened again offline: `GET /v1/me` fails, so no account is adopted yet.
        val phone = FakeConnectivity(false)
        val second = queue(account = null, online = phone)
        assertEquals("the taps of the file show at once", 3, second.state.value.entries.size)
        second.tap("Anna de Vries", AttendanceStatus.NO_SHOW)
        assertEquals(4, second.state.value.entries.size)
        assertEquals(
            "the file holds all four, not only the new tap",
            4,
            queue(account = null, online = FakeConnectivity(false)).state.value.entries.size,
        )

        // The connection is back and the account answers: the same account's four taps go, in order.
        phone.setOnline(true)
        assertEquals("nothing is sent before the account is known", 0, server.sent.size)
        second.adopt("sarah")

        assertEquals(
            listOf("Anna de Vries", "Bram Jansen", "Chris Bakker", "Anna de Vries").map(::participantIdOf),
            server.sent.map { it.clientId },
        )
        assertEquals(
            listOf(
                SetAttendanceRequest.Status.ATTENDED,
                SetAttendanceRequest.Status.NO_SHOW,
                SetAttendanceRequest.Status.ATTENDED,
                SetAttendanceRequest.Status.NO_SHOW,
            ),
            server.sent.map { it.status },
        )
        assertEquals(4, server.sent.map { it.requestId }.toSet().size)
        assertTrue(second.state.value.entries.isEmpty())
    }

    // The sign-out warning counts `entries`: the file's taps count before the account is known, so the warning is not skipped.
    @Test
    fun test_F025_1620_theTapsOfTheFileCountForTheSignOutWarningBeforeTheAccountIsKnown() {
        val first = queue(online = FakeConnectivity(false))
        first.tap("Anna de Vries", AttendanceStatus.ATTENDED)
        first.tap("Bram Jansen", AttendanceStatus.NO_SHOW)

        val second = queue(account = null, online = FakeConnectivity(false))
        assertEquals("what the screens count for the warning", 2, second.state.value.entries.size)
        assertTrue(second.state.value.waitsForConnection)

        second.clear()
        assertTrue(queue(account = null, online = FakeConnectivity(false)).state.value.entries.isEmpty())
    }

    // #1618 stays: another account's sign-in drops the earlier account's taps, also the ones read before the account was known.
    @Test
    fun test_F025_1620_anotherAccountDropsTheTapsOfTheFileButKeepsItsOwnTapBeforeTheAnswer() {
        queue(online = FakeConnectivity(false)).tap("Anna de Vries", AttendanceStatus.ATTENDED)
        queue(account = "sarah", online = FakeConnectivity(false)).tap("Bram Jansen", AttendanceStatus.NO_SHOW)

        signIn = "sign-in-2"
        val john = queue(account = null)
        john.tap("Chris Bakker", AttendanceStatus.ATTENDED)
        assertEquals("nothing is sent before the account is known", 0, server.sent.size)
        john.adopt("john")

        assertEquals(listOf(participantIdOf("Chris Bakker")), server.sent.map { it.clientId })
        assertTrue(john.state.value.entries.isEmpty())
        assertTrue(
            "nothing of Sarah is left on disk",
            queue(account = "sarah", online = FakeConnectivity(false)).state.value.entries.isEmpty(),
        )
    }

    // Iedereen aanwezig offline: after a restart it is still one request, sent once, in order with the taps around it.
    @Test
    fun test_F025_1620_everyoneAttendedOfflineSurvivesARestartAndIsSentOnceInOrder() {
        val first = queue(online = FakeConnectivity(false))
        first.tap("Bram Jansen", AttendanceStatus.NO_SHOW)
        first.enqueue(
            workspace,
            kracht,
            QueueAction.Everyone(listOf(participantIdOf("Anna de Vries"), participantIdOf("Chris Bakker"))),
        )
        first.tap("Anna de Vries", AttendanceStatus.BOOKED)

        val phone = FakeConnectivity(false)
        val second = queue(online = phone)
        assertEquals(3, second.state.value.entries.size)
        assertEquals(
            listOf(participantIdOf("Anna de Vries"), participantIdOf("Chris Bakker")),
            (second.state.value.entries[1].action as QueueAction.Everyone).clientIds,
        )
        phone.setOnline(true)

        assertEquals(
            listOf(participantIdOf("Bram Jansen"), null, participantIdOf("Anna de Vries")),
            server.sent.map { it.clientId },
        )
        assertEquals("one request for everyone, not one per row", 1, server.sent.count { it.clientId == null })
        assertTrue(second.state.value.entries.isEmpty())
    }

    // A tap made before the account was known, then the app was closed before it answered: the same sign-in is still open, so the
    // account it learns has the tap.
    @Test
    fun test_F025_1620_aTapOfAnEarlierRunOfTheSameSignInBeforeTheAccountWasKnownIsTheAccountsOfTheNextRun() {
        queue(account = null, online = FakeConnectivity(false)).tap("Anna de Vries", AttendanceStatus.ATTENDED)

        val next = queue(account = "sarah")

        assertEquals(listOf(participantIdOf("Anna de Vries")), server.sent.map { it.clientId })
        assertTrue(next.state.value.entries.isEmpty())
    }

    // A tap with no account of another sign-in is nobody's to claim: the next account's sign-in sends nothing of it (#1618).
    @Test
    fun test_F025_1620_aTapOfAnotherSignInWithNoAccountIsNeverSentUnderAnotherAccount() {
        queue(account = "sarah", online = FakeConnectivity(false)).tap("Anna de Vries", AttendanceStatus.ATTENDED)
        queue(account = null, online = FakeConnectivity(false)).tap("Bram Jansen", AttendanceStatus.NO_SHOW)

        signIn = "sign-in-2"
        val john = queue(account = "john")

        assertEquals(emptyList<SentAttendance>(), server.sent)
        assertTrue(john.state.value.entries.isEmpty())
    }

    // #1618: Sarah taps offline before `GET /v1/me` answers, the token is then rejected (so no account is ever learned), and John
    // signs in on the same phone: none of the three taps is sent with his token, and none is left on disk.
    @Test
    fun test_F025_1620_aNoAccountTapThenA401ThenAnotherAccountSignsInSendsNothingAndLeavesTheFileEmpty() {
        val sarah = queue(account = null, online = FakeConnectivity(false))
        sarah.tap("Anna de Vries", AttendanceStatus.ATTENDED)
        sarah.tap("Bram Jansen", AttendanceStatus.NO_SHOW)
        sarah.tap("Chris Bakker", AttendanceStatus.ATTENDED)
        signedIn = false // `GET /v1/me` answers 401: the session ends before an account is known

        signedIn = true
        signIn = "sign-in-2"
        val john = queue(account = "john")

        assertEquals(emptyList<SentAttendance>(), server.sent)
        assertTrue(john.state.value.entries.isEmpty())
        assertTrue(
            "nothing of Sarah's is left on disk",
            queue(account = "john", online = FakeConnectivity(false)).state.value.entries.isEmpty(),
        )
        signIn = "sign-in-1"
        assertTrue(
            "not even for the sign-in that made the taps",
            queue(account = null, online = FakeConnectivity(false)).state.value.entries.isEmpty(),
        )
    }

    // The account was learned (the tap was stamped with it) before the 401: the same account signing in again sends it, and
    // there is nothing to warn about.
    @Test
    fun test_F025_1620_aTapStampedWithTheAccountBeforeThe401IsSentWhenTheSameAccountSignsInAgain() {
        val phone = FakeConnectivity(false)
        val sarah = queue(account = null, online = phone)
        sarah.tap("Anna de Vries", AttendanceStatus.ATTENDED)
        sarah.adopt("sarah") // `GET /v1/me` answered while the phone was still offline
        signedIn = false // then a send answers 401

        signedIn = true
        signIn = "sign-in-2"
        val again = queue(account = "sarah")

        assertEquals(listOf(participantIdOf("Anna de Vries")), server.sent.map { it.clientId })
        assertTrue(again.state.value.entries.isEmpty())
        assertEquals("nothing was dropped, so nothing to say", 0, again.state.value.droppedTaps)
    }

    // The owner's decision (a) on #549: the taps made before the account was known, then a 401, then the same person signs in
    // again, cannot be sent (nobody can say they are hers): the app says so, once, with the count.
    @Test
    fun test_F025_1620_theTapsDroppedBeforeTheAccountWasKnownAreCountedForTheNoticeAfterTheNextSignIn() {
        val sarah = queue(account = null, online = FakeConnectivity(false))
        sarah.tap("Anna de Vries", AttendanceStatus.ATTENDED)
        sarah.tap("Bram Jansen", AttendanceStatus.NO_SHOW)
        sarah.enqueue(workspace, kracht, QueueAction.Everyone(listOf(participantIdOf("Chris Bakker"))))
        signedIn = false // `GET /v1/me` answers 401: the session ends before an account is known

        signedIn = true
        signIn = "sign-in-2"
        val again = queue(account = null, online = FakeConnectivity(false))
        assertEquals("nothing to say before the account is known", 0, again.state.value.droppedTaps)
        again.adopt("sarah")

        assertEquals("three requests, each counted once", 3, again.state.value.droppedTaps)
        assertEquals(emptyList<SentAttendance>(), server.sent)
        assertTrue(again.state.value.entries.isEmpty())
    }

    // Once: the notice goes when it is dismissed and is not made again, not by a later answer of `GET /v1/me`, not after the app
    // is opened again (the file no longer holds the taps).
    @Test
    fun test_F025_1620_theDroppedTapsNoticeShowsOnceAndDoesNotComeBack() {
        queue(account = null, online = FakeConnectivity(false)).tap("Anna de Vries", AttendanceStatus.ATTENDED)
        signIn = "sign-in-2"
        val again = queue(account = "sarah")
        assertEquals(1, again.state.value.droppedTaps)

        again.adopt("sarah")
        assertEquals("a later answer does not count them twice", 1, again.state.value.droppedTaps)
        again.dismissDroppedTaps()
        assertEquals(0, again.state.value.droppedTaps)

        assertEquals("the app is opened again", 0, queue(account = "sarah").state.value.droppedTaps)
        assertEquals(0, queue(account = null).state.value.droppedTaps)
    }

    // Only a tap with no account is warned about: another account's own taps are not (#1618: another account's sign-in deletes
    // them), and a tap of the account itself is kept and sent.
    @Test
    fun test_F025_1620_theDroppedTapsNoticeCountsOnlyTapsMadeBeforeTheAccountWasKnown() {
        queue(account = "sarah", online = FakeConnectivity(false)).tap("Anna de Vries", AttendanceStatus.ATTENDED)
        queue(account = null, online = FakeConnectivity(false)).tap("Bram Jansen", AttendanceStatus.NO_SHOW)

        signIn = "sign-in-2"
        val john = queue(account = "john")

        assertEquals("only Bram's tap, which had no account", 1, john.state.value.droppedTaps)
        assertEquals(emptyList<SentAttendance>(), server.sent)
    }

    // The sign-out the person chose clears the notice with everything else.
    @Test
    fun test_F025_1620_theSignOutClearsTheDroppedTapsNotice() {
        queue(account = null, online = FakeConnectivity(false)).tap("Anna de Vries", AttendanceStatus.ATTENDED)
        signIn = "sign-in-2"
        val again = queue(account = "sarah")
        assertEquals(1, again.state.value.droppedTaps)

        again.clear()

        assertEquals(0, again.state.value.droppedTaps)
    }

    // The taps another sign-in left stay on disk, out of sight, until the account is known; then those of the same account go
    // first, in the order they were tapped.
    @Test
    fun test_F025_1620_anEarlierSignInsTapsOfTheSameAccountGoBeforeTheNewOnesAfterTheAnswer() {
        queue(account = "sarah", online = FakeConnectivity(false)).tap("Anna de Vries", AttendanceStatus.ATTENDED)

        signIn = "sign-in-2"
        val phone = FakeConnectivity(false)
        val again = queue(account = null, online = phone)
        assertTrue("another sign-in's taps show nowhere", again.state.value.entries.isEmpty())
        assertTrue(again.state.value.pending(kracht).isEmpty())
        assertTrue(!again.state.value.hasPending(kracht))
        again.tap("Bram Jansen", AttendanceStatus.NO_SHOW)
        assertEquals(1, again.state.value.entries.size)
        phone.setOnline(true)
        again.adopt("sarah")

        assertEquals(
            listOf("Anna de Vries", "Bram Jansen").map(::participantIdOf),
            server.sent.map { it.clientId },
        )
    }

    // The sign-out warning counts what the screens count (`entries`): the taps of another sign-in are not this person's to be
    // warned about, and they are deleted with the rest when the person signs out.
    @Test
    fun test_F025_1620_theSignOutWarningBeforeTheAccountIsKnownDoesNotCountAnotherSignInsTaps() {
        queue(account = "sarah", online = FakeConnectivity(false)).tap("Anna de Vries", AttendanceStatus.ATTENDED)
        queue(account = null, online = FakeConnectivity(false)).tap("Bram Jansen", AttendanceStatus.NO_SHOW)

        signIn = "sign-in-2"
        val john = queue(account = null, online = FakeConnectivity(false))
        assertEquals("no tap of this sign-in yet", 0, john.state.value.entries.size)
        assertTrue(!john.state.value.waitsForConnection)

        john.clear()
        signIn = "sign-in-1"
        assertTrue(queue(account = "sarah", online = FakeConnectivity(false)).state.value.entries.isEmpty())
    }
}

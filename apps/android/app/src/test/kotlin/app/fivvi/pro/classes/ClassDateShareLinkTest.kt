package app.fivvi.pro.classes

import app.fivvi.api.models.CreateBookingLinkRequest
import app.fivvi.api.models.Session
import app.fivvi.core.me.workspaceIdOf
import app.fivvi.pro.home.FakeTrainersApi
import app.fivvi.pro.home.FakeWorkspacesApi
import app.fivvi.pro.sessions.FakeLocationsApi
import app.fivvi.pro.sessions.FakeSessionsApi
import app.fivvi.pro.sessions.trainerOf
import java.io.IOException
import java.time.Instant
import java.time.LocalDateTime
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

// TD-03 *Boekingslink delen* (F037 AC8, AC9 and the design of DECISIONS.md, Les (TD-03)): the button below the booked card
// and the first item of the Owner's ⋯ menu get or make the link of this class date in the visitor's language, put its
// short URL on the clipboard and say so. John (Owner) and Sarah (Trainer) share Kracht on Tuesday 17 November 2026,
// 18:00; the clock of the model says it is Monday 16 November 2026, 08:20 in Amsterdam (no real clock).
@OptIn(ExperimentalCoroutinesApi::class)
class ClassDateShareLinkTest {
    private val workspace = workspaceIdOf("John's Gym")
    private val sessions = FakeSessionsApi()
    private val classes = FakeGroupClassesApi(sessions)
    private val links = FakeBookingLinksApi()
    private val sarah = trainerOf("Sarah")
    private val john = trainerOf("John")
    private val kracht = groupClassOf("Kracht", nameEn = "Strength", trainer = sarah)
    private val clipboard = mutableListOf<String>()
    private val refused = mutableListOf<Int>()
    private var online = true

    // Monday 16 November 2026, 08:20 in Amsterdam (UTC+1).
    private val now = Instant.parse("2026-11-16T07:20:00Z")

    @Before
    fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun date(start: LocalDateTime = LocalDateTime.of(2026, 11, 17, 18, 0)): UUID {
        classes.classes[kracht.id] = kracht
        val date = classDateOf(UUID.randomUUID(), kracht, sarah, start = start)
        sessions.sessions[date.id] = date
        return date.id
    }

    private fun screen(id: UUID, canManage: Boolean = true, canShareLink: Boolean = true) = ClassDateViewModel(
        ClassApis(classes, sessions, FakeLocationsApi(), FakeTrainersApi(), FakeWorkspacesApi(), links),
        workspace,
        id,
        john.id,
        canManage,
        canShareLink = canShareLink,
        isOnline = { online },
        now = { now },
        copy = { clipboard += it },
        onShareNotAllowed = { refused += it.code() },
    )

    @Test
    fun test_F037_AC8_theOwnerSharesTheDatesShortLinkAndItIsOnTheClipboard() {
        val id = date()
        val model = screen(id)

        val before = model.state.value
        assertTrue(before.showsShareLink)
        assertTrue(before.canTapShareLink)
        assertEquals(0, before.copied)

        model.shareLink()

        val sent = links.requests.single()
        assertEquals(workspace, sent.first)
        assertEquals("Eén les op een datum", CreateBookingLinkRequest.Scope.SESSION, sent.second.scope)
        assertEquals("the visitor's language", CreateBookingLinkRequest.Language.VISITOR, sent.second.language)
        assertEquals(id, sent.second.sessionId)
        assertNull(sent.second.groupClassId)
        assertEquals(CreateBookingLinkRequest.Surface.ANDROID, sent.second.surface)
        val link = links.links.getValue(id)
        assertTrue(link.url.toString(), link.url.toString().startsWith("https://fivvi.app/l/"))
        assertEquals(listOf(link.url.toString()), clipboard)
        val after = model.state.value
        assertEquals("Boekingslink gekopieerd shows", 1, after.copied)
        assertNull(after.shareFailure)
        assertFalse(after.isSharing)
        assertTrue("and the button is on again", after.canTapShareLink)
    }

    @Test
    fun test_F037_AC8_aSecondTapGivesTheSameLinkAndSaysSoAgain() {
        val model = screen(date())

        model.shareLink()
        model.shareLink()

        assertEquals(2, links.requests.size)
        assertEquals("get-or-create: one link for the date", 1, links.links.size)
        assertEquals(2, clipboard.size)
        assertEquals("the same link both times", 1, clipboard.toSet().size)
        assertEquals("the second tap shows the message again", 2, model.state.value.copied)
    }

    @Test
    fun test_F037_AC9_aTrainerSharesTheSameLinkAndHasNoMenu() {
        val id = date()
        screen(id).shareLink()
        val ownerCopy = clipboard.single()
        clipboard.clear()

        val trainer = screen(id, canManage = false)
        assertTrue("Sarah has Boekingslink delen below the booked card", trainer.state.value.showsShareLink)
        trainer.shareLink()

        assertEquals("the same link as John's", listOf(ownerCopy), clipboard)
        assertEquals(1, links.links.size)
        assertFalse("no ⋯ menu beyond what F021 gives a Trainer: none", trainer.state.value.hasMenu)
        assertFalse(trainer.state.value.showsShareLinkInMenu)
        assertEquals(1, trainer.state.value.copied)
    }

    @Test
    fun test_F037_design_theOwnersMenuHasBoekingslinkDelenAsItsFirstItem() {
        val state = screen(date()).state.value

        assertTrue(state.hasMenu)
        assertTrue(state.showsShareLinkInMenu)
    }

    @Test
    fun test_F037_unavailable_aCancelledDateHasNoBoekingslinkDelen() {
        val id = date()
        val model = screen(id)
        model.askToCancel()
        model.confirmCancel()

        val state = model.state.value
        assertEquals(Session.Status.CANCELLED, state.session?.status)
        assertFalse(state.showsShareLink)
        assertFalse(state.showsShareLinkInMenu)
        model.shareLink()
        assertTrue("nothing is asked for a cancelled date", links.requests.isEmpty())
    }

    @Test
    fun test_F037_unavailable_aPastClassDateHasNoBoekingslinkDelen() {
        val id = date(start = LocalDateTime.of(2026, 11, 9, 18, 0))
        val owner = screen(id)
        val trainer = screen(id, canManage = false)

        assertFalse(owner.state.value.showsShareLink)
        assertFalse(owner.state.value.showsShareLinkInMenu)
        assertTrue("the rest of the Owner's menu stays", owner.state.value.hasMenu)
        assertFalse(trainer.state.value.showsShareLink)
        owner.shareLink()
        assertTrue(links.requests.isEmpty())
    }

    @Test
    fun test_F037_unavailable_aDateThatStartsAtThisMomentHasNoBoekingslinkDelen() {
        val start = LocalDateTime.of(2026, 11, 16, 8, 20)

        assertFalse("started: the API refuses it", screen(date(start)).state.value.showsShareLink)
        assertTrue(screen(date(start.plusMinutes(1))).state.value.showsShareLink)
    }

    @Test
    fun test_F037_unavailable_aPrivateSessionHasNoBoekingslinkDelen() {
        val private = classDateOf(UUID.randomUUID(), kracht, sarah, start = LocalDateTime.of(2026, 11, 17, 9, 0))
            .copy(type = Session.Type.PRIVATE, groupClass = null)
        sessions.sessions[private.id] = private
        val model = screen(private.id)

        assertFalse(model.state.value.showsShareLink)
        model.shareLink()
        assertTrue(links.requests.isEmpty())
    }

    @Test
    fun test_F037_design_withoutTheCapabilityThereIsNoBoekingslinkDelen() {
        val model = screen(date(), canShareLink = false)

        assertFalse(model.state.value.showsShareLink)
        assertFalse(model.state.value.showsShareLinkInMenu)
        model.shareLink()
        assertTrue(links.requests.isEmpty())
    }

    @Test
    fun test_F037_unavailable_offlineBoekingslinkDelenIsOffAndNothingIsQueued() {
        val model = screen(date())
        online = false
        model.refresh()

        val state = model.state.value
        assertEquals("the read worked: only the network says offline", ClassDateLoad.Loaded, state.load)
        assertTrue(state.showsShareLink)
        assertTrue(state.copy(online = false).isOffline)
        assertFalse("the action is unavailable", state.copy(online = false).canTapShareLink)
        model.shareLink()
        assertTrue("nothing is asked of the API, and nothing is queued", links.requests.isEmpty())
        assertTrue(clipboard.isEmpty())

        online = true
        assertTrue("back online, the action is on again", state.copy(online = true).canTapShareLink)
    }

    @Test
    fun test_F037_unavailable_aRequestThatCouldNotReachTheApiSaysItIsOfflineAndQueuesNothing() {
        val model = screen(date())
        links.failure = IOException("offline")

        model.shareLink()

        val state = model.state.value
        assertTrue(clipboard.isEmpty())
        assertEquals(0, state.copied)
        assertTrue(state.isOffline)
        assertFalse(state.canTapShareLink)
        assertEquals("not retried by the app", 1, links.requests.size)

        links.failure = null
        model.refresh()
        assertTrue("the read that comes through clears it", model.state.value.canTapShareLink)
        model.shareLink()
        assertEquals(1, clipboard.size)
    }

    @Test
    fun test_F037_design_aRefusalSaysThePersonMayNotAndAsksTheHelperToReload() {
        val model = screen(date())
        links.status = 403

        model.shareLink()

        assertEquals(ShareFailure.NoPermission, model.state.value.shareFailure)
        assertEquals(listOf(403), refused)
        assertTrue(clipboard.isEmpty())
        assertEquals(0, model.state.value.copied)
    }

    @Test
    fun test_F037_design_anyOtherFailureSaysSomethingWentWrongAndASecondTapStartsClean() {
        val model = screen(date())
        links.status = 500

        model.shareLink()

        assertEquals(ShareFailure.NotShared, model.state.value.shareFailure)
        assertTrue(clipboard.isEmpty())
        assertFalse(model.state.value.isSharing)

        links.status = null
        model.shareLink()
        assertNull("the failure goes with the next try", model.state.value.shareFailure)
        assertEquals(1, model.state.value.copied)
    }
}

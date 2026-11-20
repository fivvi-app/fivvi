package app.fivvi.pro.classes

import app.fivvi.api.models.Trainer
import app.fivvi.core.me.workspaceIdOf
import app.fivvi.pro.home.FakeTrainersApi
import app.fivvi.pro.home.FakeWorkspacesApi
import app.fivvi.pro.sessions.FakeLocationsApi
import app.fivvi.pro.sessions.FakeSessionsApi
import app.fivvi.pro.sessions.trainerOf
import java.io.IOException
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

// TD-03 *Groepsles* (F021 AC3, AC5, AC7 and the design of DECISIONS.md §3): a class on a date as the team reads it.
@OptIn(ExperimentalCoroutinesApi::class)
class ClassDateViewModelTest {
    private val workspace = workspaceIdOf("John's Gym")
    private val sessions = FakeSessionsApi()
    private val classes = FakeGroupClassesApi(sessions)
    private val sarah = trainerOf("Sarah")
    private val john = trainerOf("John")
    private val notAllowed = mutableListOf<Int>()
    private val mobility = groupClassOf(
        "Mobility",
        nameEn = "Mobility flow",
        descriptionNl = "Rustig bewegen en rekken.",
        descriptionEn = "Gentle moving and stretching.",
        trainer = sarah,
    )

    @Before
    fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun date(
        groupClass: app.fivvi.api.models.GroupClass = mobility,
        trainer: Trainer? = sarah,
        booked: Int = 0,
        cancelled: Int = 0,
    ): UUID {
        classes.classes[groupClass.id] = groupClass
        val date = classDateOf(UUID.randomUUID(), groupClass, trainer, booked = booked, cancelled = cancelled)
        sessions.sessions[date.id] = date
        return date.id
    }

    private fun viewModel(
        id: UUID,
        teamMemberId: UUID = john.id,
        canManage: Boolean = true,
        justAdded: Boolean = false,
    ) = ClassDateViewModel(
        ClassApis(classes, sessions, FakeLocationsApi(), FakeTrainersApi(), FakeWorkspacesApi()),
        workspace,
        id,
        teamMemberId,
        canManage,
        justAdded,
        onNotAllowed = { notAllowed += it.code() },
    )

    @Test
    fun test_F021_AC3_theDateShowsTheNameTheTimeTheLocationTheTrainerAndThePlaces() {
        val state = viewModel(date(booked = 3, cancelled = 1)).state.value

        assertEquals(ClassDateLoad.Loaded, state.load)
        assertEquals("Mobility", state.title(english = false))
        assertEquals("John's Gym", state.session?.location?.name)
        assertEquals("Sarah", state.session?.trainer?.name)
        assertEquals(3, state.booked)
        assertEquals(12, state.capacity)
        assertEquals(9, state.free)
        assertFalse(state.showsNoBookings)
    }

    @Test
    fun test_F021_AC3_aDateWithoutBookingsSaysSo() {
        val state = viewModel(date()).state.value

        assertTrue(state.showsNoBookings)
        assertEquals(12, state.free)
    }

    @Test
    fun test_F021_AC5_aDateWithoutATrainerHasNone() {
        val state = viewModel(date(trainer = null)).state.value

        assertNull(state.session?.trainer)
        assertFalse(state.trainerIsMe)
    }

    @Test
    fun test_F021_AC3_theTrainerIsToldFromThePersonByTheTeamMemberId() {
        val id = date()

        assertTrue(viewModel(id, teamMemberId = sarah.id).state.value.trainerIsMe)
        assertFalse(viewModel(id, teamMemberId = john.id).state.value.trainerIsMe)
    }

    @Test
    fun test_F021_AC3_theNameIsInTheViewersLanguageElseDutch() {
        val named = viewModel(date()).state.value
        val unnamed = viewModel(date(groupClassOf("Yoga"))).state.value

        assertEquals("Mobility flow", named.title(english = true))
        assertEquals("Mobility", named.title(english = false))
        assertEquals("Yoga", unnamed.title(english = true))
    }

    @Test
    fun test_F021_design_theDescriptionIsInTheViewersLanguageElseDutchMarkedAsDutch() {
        val state = viewModel(date()).state.value

        assertEquals(ClassText("Rustig bewegen en rekken.", false), state.description(english = false))
        assertEquals(ClassText("Gentle moving and stretching.", false), state.description(english = true))

        val dutchOnly = viewModel(date(groupClassOf("Yoga", descriptionNl = "Rustig."))).state.value
        assertEquals(ClassText("Rustig.", true), dutchOnly.description(english = true))
        assertEquals(ClassText("Rustig.", false), dutchOnly.description(english = false))
    }

    @Test
    fun test_F021_design_aClassWithoutADescriptionShowsNone() {
        val state = viewModel(date(groupClassOf("Yoga", descriptionNl = "", descriptionEn = ""))).state.value

        assertNull(state.description(english = false))
        assertNull(state.description(english = true))
    }

    @Test
    fun test_F021_design_theDescriptionOpensWithMeerAndClosesWithMinder() {
        val viewModel = viewModel(date())
        assertFalse(viewModel.state.value.descriptionOpen)

        viewModel.toggleDescription()
        assertTrue(viewModel.state.value.descriptionOpen)
        viewModel.toggleDescription()
        assertFalse(viewModel.state.value.descriptionOpen)
    }

    @Test
    fun test_F021_design_theOwnerHasTheMenuWhoseEditSaysTheClassIsManagedOnTheWeb() {
        val viewModel = viewModel(date())
        assertTrue(viewModel.state.value.hasMenu)
        assertFalse(viewModel.state.value.manageOnWeb)

        viewModel.editTapped()

        assertTrue(viewModel.state.value.manageOnWeb)
    }

    @Test
    fun test_F021_design_aTrainerHasNoMenu() {
        assertFalse(viewModel(date(), teamMemberId = sarah.id, canManage = false).state.value.hasMenu)
    }

    @Test
    fun test_F021_AC6_aDateJustAddedSaysSo() {
        assertTrue(viewModel(date(), justAdded = true).state.value.justAdded)
        assertFalse(viewModel(date()).state.value.justAdded)
    }

    @Test
    fun test_F021_AC3_aDateTheApiRefusesHasNoScreenAnd403TellsTheCapabilityHelper() {
        sessions.getStatus = 403
        val forbidden = viewModel(date()).state.value
        sessions.getStatus = 404
        val gone = viewModel(date()).state.value

        assertEquals(ClassDateLoad.NoPermission, forbidden.load)
        assertEquals(ClassDateLoad.NoPermission, gone.load)
        assertEquals(listOf(403), notAllowed)
    }

    @Test
    fun test_F021_AC3_aReadThatFailsCanBeRetriedAndALaterOneThatFailsKeepsWhatIsShown() {
        val id = date()
        sessions.failure = IOException("offline")
        val viewModel = viewModel(id)
        assertEquals(ClassDateLoad.Failed, viewModel.state.value.load)

        sessions.failure = null
        viewModel.retry()
        assertEquals(ClassDateLoad.Loaded, viewModel.state.value.load)

        sessions.failure = IOException("offline")
        viewModel.refresh()
        assertEquals(ClassDateLoad.Loaded, viewModel.state.value.load)
        assertEquals("Mobility", viewModel.state.value.title(english = false))
    }

    @Test
    fun test_F021_AC3_theDescriptionIsOnlyToWordTheScreenSoAFailedReadOfTheClassChangesNothing() {
        val id = date()
        classes.getStatus = 500

        val state = viewModel(id).state.value

        assertEquals(ClassDateLoad.Loaded, state.load)
        assertEquals("Mobility", state.title(english = false))
        assertNull(state.description(english = false))
    }
}

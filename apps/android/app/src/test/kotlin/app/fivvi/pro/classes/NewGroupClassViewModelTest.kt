package app.fivvi.pro.classes

import app.fivvi.api.models.CreateGroupClassRequest
import app.fivvi.api.models.FirstGroupClassDate
import app.fivvi.api.models.SessionSeries
import app.fivvi.api.models.Trainer
import app.fivvi.core.me.workspaceIdOf
import app.fivvi.pro.home.FakeTrainersApi
import app.fivvi.pro.home.FakeWorkspacesApi
import app.fivvi.pro.sessions.FakeLocationsApi
import app.fivvi.pro.sessions.FakeSessionsApi
import app.fivvi.pro.sessions.NewSessionLoad
import app.fivvi.pro.sessions.SaveFailure
import app.fivvi.pro.sessions.SessionFormat
import app.fivvi.pro.sessions.TimeRefusal
import app.fivvi.pro.sessions.sessionIdOf
import app.fivvi.pro.sessions.sessionOf
import app.fivvi.pro.sessions.trainerOf
import java.io.IOException
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
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

// TD-05 *Nieuwe groepsles* (F021 AC6): the form collects, the API creates the class and its date and decides every rule.
@OptIn(ExperimentalCoroutinesApi::class)
class NewGroupClassViewModelTest {
    private val workspace = workspaceIdOf("John's Gym")
    private val sessions = FakeSessionsApi()
    private val classes = FakeGroupClassesApi(sessions)
    private val locations = FakeLocationsApi()
    private val trainers = FakeTrainersApi()
    private val notAllowed = mutableListOf<Int>()
    private val sarah = trainerOf("Sarah")
    private val tom = trainerOf("Tom")
    private val john = trainerOf("John")

    // 8 September 2026, 10:20 in Amsterdam: the form starts at 11:00.
    private val now = Instant.parse("2026-09-08T08:20:00Z")

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        trainers.trainers = listOf(john, sarah, tom)
        sessions.trainers += listOf(john, sarah, tom).associateBy { it.id }
    }

    @After
    fun tearDown() = Dispatchers.resetMain()

    // The person, by their team-member ID in the workspace: John's (the Owner) unless given.
    private fun viewModel(teamMemberId: UUID = john.id) = NewGroupClassViewModel(
        ClassApis(classes, sessions, locations, trainers, FakeWorkspacesApi()),
        workspace,
        teamMemberId,
        onNotAllowed = { notAllowed += it.code() },
        now = { now },
    )

    private fun NewGroupClassViewModel.state() = state.value

    @Test
    fun test_F021_AC6_theFormStartsWithCapacity12ThePersonAsTrainerAndTheNextFullHour() {
        val state = viewModel().state()

        assertEquals(NewSessionLoad.Ready, state.load)
        assertEquals(12, state.capacity)
        assertEquals(john.id, state.trainerId)
        assertEquals("John's Gym", state.locationName)
        assertEquals(LocalDateTime.of(2026, 9, 8, 11, 0), state.time.start)
        assertEquals(LocalTime.of(12, 0), state.endsAt)
        assertEquals(listOf("John", "Sarah", "Tom"), state.trainers.map { it.name })
        assertTrue(state.canSave)
        assertFalse(state.isDirty)
    }

    @Test
    fun test_F021_AC6_anOwnerWhoDoesNotTrainStartsWithTrainerNodig() {
        trainers.trainers = listOf(sarah, tom)

        val state = viewModel().state()

        assertNull(state.trainerId)
        assertNull(state.myTrainerId)
    }

    @Test
    fun test_F021_AC6_theApiCreatesTheClassWithItsFirstDateInOneRequestAndTd03Opens() {
        val viewModel = viewModel()
        viewModel.setNameNl("  Mobility ")
        viewModel.setNameEn("Mobility flow")
        viewModel.setDescriptionNl("Rustig bewegen en rekken.")
        viewModel.setDescriptionEn("Gentle moving and stretching.")
        viewModel.setDate(LocalDate.of(2026, 9, 24))
        viewModel.setStart(LocalTime.of(18, 0))

        viewModel.save()

        assertEquals(
            listOf(
                workspace to CreateGroupClassRequest(
                    nameNl = "Mobility",
                    capacity = 12,
                    durationMinutes = 60,
                    nameEn = "Mobility flow",
                    descriptionNl = "Rustig bewegen en rekken.",
                    descriptionEn = "Gentle moving and stretching.",
                    trainerId = john.id,
                    firstDate = FirstGroupClassDate("2026-09-24", "18:00"),
                    surface = CreateGroupClassRequest.Surface.ANDROID,
                ),
            ),
            classes.created,
        )
        val saved = viewModel.state().saved
        assertEquals("Mobility", saved?.groupClass?.nameNl)
        assertEquals(john.id, saved?.trainer?.id)
        assertEquals(12, saved?.capacity)
        assertFalse(viewModel.state().saving)
    }

    @Test
    fun test_F021_AC6_aBlankNameInEnglishOrADescriptionMeansNoneAndTrainerNodigSendsNoTrainer() {
        val viewModel = viewModel()
        viewModel.setNameNl("Mobility")
        viewModel.setNameEn("   ")
        viewModel.setDescriptionNl("")
        viewModel.setTrainer(null)

        viewModel.save()

        val sent = classes.created.single().second
        assertNull(sent.nameEn)
        assertNull(sent.descriptionNl)
        assertNull(sent.descriptionEn)
        assertNull(sent.trainerId)
        assertNull(viewModel.state().saved?.trainer)
    }

    @Test
    fun test_F021_AC6_theCapacityAndTheEndAreSentAsTheApiTakesThem() {
        val viewModel = viewModel()
        viewModel.setNameNl("Mobility")
        viewModel.setStart(LocalTime.of(18, 0))
        viewModel.setCapacity(8)
        viewModel.setEnd(LocalTime.of(19, 15))

        viewModel.save()

        val sent = classes.created.single().second
        assertEquals(8, sent.capacity)
        assertEquals(75, sent.durationMinutes)
        assertEquals(LocalTime.of(19, 15), viewModel.state().endsAt)
    }

    @Test
    fun test_F021_AC6_theCapacityStaysBetweenOneAndAHundred() {
        val viewModel = viewModel()

        viewModel.setCapacity(0)
        assertEquals(1, viewModel.state().capacity)
        viewModel.setCapacity(101)
        assertEquals(100, viewModel.state().capacity)
    }

    @Test
    fun test_F021_AC6_theApiNamesTheFieldsItRefusesAndTypingClearsThem() {
        classes.createAnswers += {
            sessions.refused(
                "nameNl" to "too_small",
                "nameEn" to "too_big",
                "descriptionNl" to "too_big",
                "descriptionEn" to "too_big",
                "capacity" to "too_big",
                "durationMinutes" to "too_small",
            )
        }
        val viewModel = viewModel()

        viewModel.save()

        val state = viewModel.state()
        assertEquals(ClassField.entries.toSet(), state.refused.keys)
        assertEquals("too_small", state.refused[ClassField.NameNl])
        assertNull(state.saveFailure)
        assertNull(state.saved)
        assertFalse(state.saving)
        viewModel.setNameNl("Mobility")
        viewModel.setCapacity(10)
        viewModel.setEnd(LocalTime.of(12, 30))
        assertEquals(
            setOf(ClassField.NameEn, ClassField.DescriptionNl, ClassField.DescriptionEn),
            viewModel.state().refused.keys,
        )
    }

    @Test
    fun test_F021_AC6_aRefusedDateIsShownUnderTheTimeNotLeftBehindAsAClass() {
        classes.createAnswers += { sessions.refused("firstDate.localStart" to "time_does_not_exist") }
        val viewModel = viewModel()
        viewModel.setNameNl("Mobility")

        viewModel.save()

        assertEquals(TimeRefusal.TimeDoesNotExist, viewModel.state().time.refusal)
        assertTrue(viewModel.state().refused.isEmpty())
        assertNull(viewModel.state().saveFailure)
        assertTrue(classes.classes.isEmpty())
        viewModel.setStart(LocalTime.of(10, 0))
        assertNull(viewModel.state().time.refusal)
    }

    @Test
    fun test_F021_AC6_aRefusalOfNoKnownFieldSaysItWasNotSaved() {
        classes.createAnswers += { sessions.refused("somethingElse" to "invalid") }
        val viewModel = viewModel()

        viewModel.save()

        assertEquals(SaveFailure.NotSaved, viewModel.state().saveFailure)
    }

    @Test
    fun test_F021_AC6_aRefusalOfTheSaveTellsTheCapabilityHelperAndSaysSo() {
        classes.createAnswers += { sessions.status(403) }
        val viewModel = viewModel()

        viewModel.save()

        assertEquals(SaveFailure.NoPermission, viewModel.state().saveFailure)
        assertEquals(listOf(403), notAllowed)
        assertNull(viewModel.state().saved)
    }

    @Test
    fun test_F021_AC6_anyOtherAnswerSaysItWasNotSavedAndKeepsTheInput() {
        classes.createAnswers += { sessions.status(500) }
        val viewModel = viewModel()
        viewModel.setNameNl("Mobility")

        viewModel.save()

        assertEquals(SaveFailure.NotSaved, viewModel.state().saveFailure)
        assertEquals("Mobility", viewModel.state().nameNl)
        assertTrue(viewModel.state().canSave)
    }

    // Thursday 24 September 2026, 18:00-19:00: the session of Tom that a new class at 18:30 would overlap.
    private fun somethingAtSix(trainer: Trainer) {
        val booked = sessionOf(
            id = sessionIdOf("anna"),
            client = app.fivvi.pro.clients.clientOf("Anna de Vries", "anna@example.com"),
            trainer = trainer,
            start = LocalDateTime.of(2026, 9, 24, 18, 0),
        )
        sessions.sessions[booked.id] = booked
    }

    private fun NewGroupClassViewModel.fillIn() {
        setNameNl("Mobility")
        setDate(LocalDate.of(2026, 9, 24))
        setStart(LocalTime.of(18, 30))
    }

    @Test
    fun test_F023_AC6_aTrainerWhoAlreadyHasSomethingThenGetsTheWarningAndNothingIsStored() {
        somethingAtSix(john)
        val viewModel = viewModel()
        viewModel.fillIn()

        viewModel.save()

        val state = viewModel.state()
        assertNull(state.doubleBooking?.trainerName)
        assertEquals(listOf("Anna de Vries"), state.doubleBooking?.conflicts?.map { it.displayName })
        assertNull(state.saved)
        assertNull(state.saveFailure)
        assertTrue(classes.classes.isEmpty())
        assertEquals("Mobility", state.nameNl)
    }

    @Test
    fun test_F023_AC6_theWarningNamesAnotherTrainerWhenTheOwnerChoseThem() {
        somethingAtSix(tom)
        val viewModel = viewModel()
        viewModel.fillIn()
        viewModel.setTrainer(tom.id)

        viewModel.save()

        assertEquals("Tom", viewModel.state().doubleBooking?.trainerName)
    }

    @Test
    fun test_F023_AC6_saveAnywaySendsTheSameRequestWithAllowConflictsAndOpensTheDate() {
        somethingAtSix(john)
        val viewModel = viewModel()
        viewModel.fillIn()
        viewModel.save()

        viewModel.save(allowConflicts = true)

        assertNull(viewModel.state().doubleBooking)
        assertEquals(2, classes.created.size)
        assertNull(classes.created[0].second.allowConflicts)
        assertEquals(classes.created[0].second.copy(allowConflicts = true), classes.created[1].second)
        assertNotNull(viewModel.state().saved)
    }

    @Test
    fun test_F023_AC6_backClosesTheWarningKeepsTheFormAndSendsNothing() {
        somethingAtSix(john)
        val viewModel = viewModel()
        viewModel.fillIn()
        viewModel.save()

        viewModel.dismissDoubleBooking()

        assertNull(viewModel.state().doubleBooking)
        assertEquals("Mobility", viewModel.state().nameNl)
        assertTrue(viewModel.state().canSave)
        assertEquals(1, classes.created.size)
    }

    @Test
    fun test_F021_AC6_aConflictWithoutSessionsSaysItWasNotSaved() {
        classes.createAnswers += { sessions.trainerConflict() }
        val viewModel = viewModel()

        viewModel.save()

        assertEquals(SaveFailure.NotSaved, viewModel.state().saveFailure)
        assertNull(viewModel.state().doubleBooking)
    }

    @Test
    fun test_F021_AC6_withNoConnectionSavingIsOffAndNothingIsQueued() {
        locations.failure = IOException("offline")
        val viewModel = viewModel()

        assertEquals(NewSessionLoad.Offline, viewModel.state().load)
        assertTrue(viewModel.state().isOffline)
        assertFalse(viewModel.state().canSave)
        viewModel.save()
        assertTrue(classes.created.isEmpty())

        locations.failure = null
        viewModel.start()

        assertEquals(NewSessionLoad.Ready, viewModel.state().load)
        assertTrue(viewModel.state().canSave)
    }

    @Test
    fun test_F021_AC6_aSaveThatCouldNotReachTheApiTurnsSavingOffUntilItIsReadAgainAndKeepsTheInput() {
        val viewModel = viewModel()
        viewModel.setNameNl("Mobility")
        classes.failure = IOException("offline")

        viewModel.save()

        assertTrue(viewModel.state().isOffline)
        assertFalse(viewModel.state().canSave)
        assertNull(viewModel.state().saveFailure)
        classes.failure = null
        viewModel.start()
        assertTrue(viewModel.state().canSave)
        assertEquals("Mobility", viewModel.state().nameNl)
    }

    @Test
    fun test_F021_AC6_aWorkspaceTheApiRefusesHasNoForm() {
        locations.status = 404

        assertEquals(NewSessionLoad.NoPermission, viewModel().state().load)
    }

    @Test
    fun test_F021_AC6_aTrainersListTheApiRefusesHasNoFormAndAnyOtherAnswerCanBeRetried() {
        trainers.listStatus = 403
        assertEquals(NewSessionLoad.NoPermission, viewModel().state().load)

        trainers.listStatus = 500
        val viewModel = viewModel()
        assertEquals(NewSessionLoad.Failed, viewModel.state().load)

        trainers.listStatus = null
        viewModel.start()
        assertEquals(NewSessionLoad.Ready, viewModel.state().load)
    }

    @Test
    fun test_F021_AC6_leavingWithSomethingEnteredAsksFirst() {
        val viewModel = viewModel()
        assertFalse(viewModel.state().isDirty)

        viewModel.setNameEn("Mobility")
        assertTrue(viewModel.state().isDirty)
        viewModel.setNameEn("")
        assertFalse(viewModel.state().isDirty)
        viewModel.setCapacity(10)
        assertTrue(viewModel.state().isDirty)
        viewModel.setCapacity(12)
        viewModel.setTrainer(tom.id)
        assertTrue(viewModel.state().isDirty)
        viewModel.setTrainer(john.id)
        viewModel.setEnd(LocalTime.of(12, 30))
        assertTrue(viewModel.state().isDirty)
        viewModel.setEnd(LocalTime.of(12, 0))
        assertFalse(viewModel.state().isDirty)
    }

    @Test
    fun test_F021_AC6_theSavedDateIsHandedOnOnce() {
        val viewModel = viewModel()
        viewModel.setNameNl("Mobility")
        viewModel.save()
        assertNotNull(viewModel.state().saved)

        viewModel.onSavedHandled()

        assertNull(viewModel.state().saved)
    }

    // F022 *Herhalen*: Niet herhalen or Elke week op {weekday}; the API makes the series and its 12 dates.
    private fun NewGroupClassViewModel.weeklyMobility() {
        setNameNl("Mobility")
        // Thursday 19 November 2026, 18:00.
        setDate(LocalDate.of(2026, 11, 19))
        setStart(LocalTime.of(18, 0))
        setRepeatsWeekly(true)
    }

    @Test
    fun test_F022_AC6_weeklyShowsTheNoteAndMakesTheFormDirty() {
        val viewModel = viewModel()
        assertFalse(viewModel.state().repeatsWeekly)
        assertFalse(viewModel.state().isDirty)

        viewModel.setRepeatsWeekly(true)

        assertTrue(viewModel.state().repeatsWeekly)
        assertTrue(viewModel.state().isDirty)
        viewModel.setRepeatsWeekly(false)
        assertFalse(viewModel.state().isDirty)
    }

    // The screen words *Elke week op {weekday}* from the date in the state (NewGroupClassScreen), so the weekday follows it.
    @Test
    fun test_F022_AC6_theWeekdayOfElkeWeekOpFollowsAChangedDate() {
        val viewModel = viewModel()
        viewModel.setRepeatsWeekly(true)
        val amsterdam = ZoneId.of("Europe/Amsterdam")
        val dutch = SessionFormat(Locale.forLanguageTag("nl-NL"), amsterdam)
        val english = SessionFormat(Locale.UK, amsterdam)

        viewModel.setDate(LocalDate.of(2026, 11, 19))
        assertEquals("donderdag", dutch.weekday(viewModel.state().time.start.toLocalDate()))
        assertEquals("Thursday", english.weekday(viewModel.state().time.start.toLocalDate()))

        viewModel.setDate(LocalDate.of(2026, 11, 23))
        assertEquals("maandag", dutch.weekday(viewModel.state().time.start.toLocalDate()))
        assertEquals("Monday", english.weekday(viewModel.state().time.start.toLocalDate()))
        assertTrue("the weekly choice stays", viewModel.state().repeatsWeekly)
    }

    @Test
    fun test_F022_AC6_aWeeklyMobilityOnThursdayIsSentAsWeeklyAndTheApiMakesTwelveDatesWithTheSeries() {
        val viewModel = viewModel()
        viewModel.weeklyMobility()

        viewModel.save()

        assertEquals("one request: the class and its series", 1, classes.created.size)
        val sent = classes.created.single().second
        assertEquals(FirstGroupClassDate("2026-11-19", "18:00", FirstGroupClassDate.Repeat.WEEKLY), sent.firstDate)
        assertEquals(listOf("Mobility"), classes.classes.values.map { it.nameNl })
        assertEquals(WEEKLY_DATES, sessions.sessions.size)
        val state = viewModel.state()
        assertEquals(12, state.datesAdded)
        assertEquals(SessionSeries.Weekday.TH, state.saved?.series?.weekday)
        assertEquals("18:00", state.saved?.series?.localStartTime)
        assertEquals("one series", 1, sessions.sessions.values.mapNotNull { it.series?.id }.toSet().size)
    }

    @Test
    fun test_F022_AC6_withoutHerhalenTheDateIsSentOnItsOwnAndAddsOne() {
        val viewModel = viewModel()
        viewModel.setNameNl("Mobility")

        viewModel.save()

        assertEquals(null, classes.created.single().second.firstDate?.repeat)
        assertEquals(1, sessions.sessions.size)
        assertEquals(1, viewModel.state().datesAdded)
        assertNull(viewModel.state().saved?.series)
    }

    @Test
    fun test_F022_AC7_aWeeklyTimeTheClocksSkipOnOneOfItsDatesShowsTheApisMessageWithThatDateAndStoresNothing() {
        classes.skippedStart = LocalDate.of(2027, 3, 28)
        val viewModel = viewModel()
        viewModel.weeklyMobility()
        viewModel.setDate(LocalDate.of(2027, 3, 14))
        viewModel.setStart(LocalTime.of(2, 30))

        viewModel.save()

        val state = viewModel.state()
        assertNull(state.saved)
        assertTrue("nothing is created", classes.classes.isEmpty())
        assertTrue(sessions.sessions.isEmpty())
        assertEquals(TimeRefusal.TimeDoesNotExist, state.time.refusal)
        assertEquals(LocalDate.of(2027, 3, 28), state.refusedDate)
        assertNull(state.saveFailure)
        assertTrue("what was chosen stays", state.repeatsWeekly)
        assertEquals("Mobility", state.nameNl)
        assertTrue(state.canSave)
    }

    @Test
    fun test_F022_AC7_aSkippedStartOnASingleDateNamesTheDateOfTheStart() {
        classes.createAnswers += { sessions.refused("firstDate.localStart" to "time_does_not_exist") }
        val viewModel = viewModel()
        viewModel.setNameNl("Mobility")
        viewModel.setDate(LocalDate.of(2027, 3, 28))
        viewModel.setStart(LocalTime.of(2, 30))

        viewModel.save()

        assertEquals(TimeRefusal.TimeDoesNotExist, viewModel.state().time.refusal)
        assertEquals(LocalDate.of(2027, 3, 28), viewModel.state().refusedDate)
    }
}

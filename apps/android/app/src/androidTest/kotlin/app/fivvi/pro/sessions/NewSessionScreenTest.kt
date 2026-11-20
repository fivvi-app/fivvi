package app.fivvi.pro.sessions

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import app.fivvi.api.models.Client
import app.fivvi.core.AppLanguage
import app.fivvi.core.R
import app.fivvi.core.appLanguageParameters
import app.fivvi.pro.clients.clientOf
import app.fivvi.pro.localizedString
import app.fivvi.pro.showAtLargestFontScale
import java.time.LocalDateTime
import java.util.UUID
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// PS-04 *Nieuwe privésessie* (F020 AC1, AC2, AC10), in both languages at the largest font scale.
@RunWith(Parameterized::class)
class NewSessionScreenTest(@Suppress("UNUSED_PARAMETER") tag: String, private val language: AppLanguage) {
    @get:Rule
    val compose = createComposeRule()

    private val anna = clientOf("Anna de Vries", "anna@example.com", Client.EmailLocale.NL_NL)
    private val mark = clientOf("Mark Jansen", "mark@example.com", Client.EmailLocale.EN)
    private val sarah = trainerOf("Sarah")
    private val tom = trainerOf("Tom")
    private val john = trainerOf("John")
    private var saved = 0
    private var closed = 0
    private var retried = 0
    private var picked = 0
    private val chosenTrainers = mutableListOf<UUID>()
    private val notify = mutableListOf<Boolean>()
    private val durations = mutableListOf<Int>()
    private var discarded = 0
    private var kept = 0

    private fun string(id: Int, vararg args: Any) = localizedString(language, id, *args)

    private fun ready(
        client: Client? = null,
        notifyOn: Boolean = true,
        start: LocalDateTime = LocalDateTime.of(2026, 9, 24, 9, 0),
        minutes: Int = 60,
        load: NewSessionLoad = NewSessionLoad.Ready,
        sawOffline: Boolean = false,
        trainers: List<app.fivvi.api.models.Trainer> = emptyList(),
        trainerId: UUID? = null,
        mine: UUID? = null,
        failure: SaveFailure? = null,
        refusal: TimeRefusal? = null,
        clientMissing: Boolean = false,
    ) = NewSessionState(
        load = load,
        client = client,
        notify = notifyOn,
        trainerId = trainerId,
        time = SessionTime(start, minutes, refusal = refusal),
        trainers = trainers,
        myTrainerId = mine,
        locationName = "John's Gym",
        sawOffline = sawOffline,
        saveFailure = failure,
        clientMissing = clientMissing,
    )

    private fun show(state: NewSessionState, forAnyTrainer: Boolean = false, confirmingDiscard: Boolean = false) =
        compose.showAtLargestFontScale(language) {
            NewSessionScreen(
                state = state,
                forAnyTrainer = forAnyTrainer,
                ownName = "Sarah",
                workspaceName = "John's Gym",
                confirmingDiscard = confirmingDiscard,
                onDismissDiscard = { kept++ },
                onDiscard = { discarded++ },
                actions = NewSessionActions(
                    onClose = { closed++ },
                    onSave = { saved++ },
                    onRetry = { retried++ },
                    onPickClient = { picked++ },
                    onNotify = { notify += it },
                    onTrainer = { chosenTrainers += it },
                    time = SessionTimeActions({}, {}, { durations += it }, {}),
                ),
            )
        }

    @Test
    fun test_F020_AC1_theFormHasTheClientTheTimeTheLocationAndOpensTheClientList() {
        show(ready())

        compose.onNodeWithTag(NewSessionTags.TITLE).assertTextEquals(string(R.string.sessions_form_title))
        compose.onNodeWithTag(
            NewSessionTags.CLIENT_NAME,
        ).assertTextEquals(string(R.string.sessions_form_client_placeholder))
        compose.onNodeWithTag("newSession.startValue").assertTextEquals("09:00")
        compose.onNodeWithTag(
            NewSessionTags.LOCATION,
        ).assertTextEquals(string(R.string.sessions_form_location, "John's Gym"))

        compose.onNodeWithTag(NewSessionTags.CLIENT).performClick()

        assertEquals(1, picked)
    }

    @Test
    fun test_F020_AC1_theDateIsWrittenInTheLanguageAndTheEndIsShown() {
        show(ready())

        compose.onNodeWithTag("newSession.dateValue")
            .assertTextContains(if (language == AppLanguage.DUTCH) "do 24 sep" else "Thu 24 Sep", substring = true)
        compose.onNodeWithTag("newSession.dateValue").assertTextContains("2026", substring = true)
        compose.onNodeWithTag("newSession.endsAt").assertTextEquals(string(R.string.sessions_form_ends_at, "10:00"))
    }

    @Test
    fun test_F020_AC4_pastMidnightTheEndSaysNextDay() {
        show(ready(start = LocalDateTime.of(2026, 9, 24, 23, 30), minutes = 90))

        compose.onNodeWithTag(
            "newSession.endsAt",
        ).assertTextEquals(string(R.string.sessions_form_ends_at_next_day, "01:00"))
    }

    @Test
    fun test_F020_AC1_theDurationHasTheThreeChipsAndOther() {
        show(ready())

        compose.onNodeWithTag("newSession.duration.45").assertIsDisplayed()
        compose.onNodeWithTag("newSession.duration.90").performClick()
        compose.onNodeWithTag("newSession.duration.other")
            .assertTextContains(string(R.string.sessions_form_duration_other), substring = true)
        assertEquals(listOf(90), durations)
        compose.onNodeWithTag("newSession.durationOther").assertDoesNotExist()
    }

    @Test
    fun test_F020_AC1_aLengthThatIsNotAChipShowsTheListOfOtherLengths() {
        show(ready(minutes = 75))

        compose.onNodeWithTag(
            "newSession.durationOtherValue",
        ).assertTextEquals(string(R.string.sessions_form_duration_minutes, "75"))
    }

    @Test
    fun test_F020_AC2_aTrainerSeesThemselvesFixedAndNoList() {
        show(ready())

        compose.onNodeWithTag(
            NewSessionTags.TRAINER_FIXED,
        ).assertTextEquals(string(R.string.sessions_form_trainer_me, "Sarah"))
        compose.onNodeWithTag(NewSessionTags.TRAINER).assertDoesNotExist()
    }

    @Test
    fun test_F020_AC2_theOwnerChoosesAmongAllTrainersAndIsMarkedAsMe() {
        show(
            ready(trainers = listOf(john, sarah, tom), trainerId = john.id, mine = john.id),
            forAnyTrainer = true,
        )

        compose.onNodeWithTag(
            NewSessionTags.TRAINER_VALUE,
        ).assertTextEquals(string(R.string.sessions_form_trainer_me, "John"))
        compose.onNodeWithTag(NewSessionTags.TRAINER_FIXED).assertDoesNotExist()

        compose.onNodeWithTag(NewSessionTags.TRAINER).performClick()
        // The menu is a popup window, which doesn't take the test's language: its names are asserted through the app
        // (PrivateSessionFlowTest) and here only what no language changes.
        compose.onNodeWithTag("${NewSessionTags.TRAINER}.${john.id}").assertIsDisplayed()
        compose.onNodeWithTag("${NewSessionTags.TRAINER}.${sarah.id}").assertTextEquals("Sarah")
        compose.onNodeWithTag("${NewSessionTags.TRAINER}.${tom.id}").performClick()

        assertEquals(listOf(tom.id), chosenTrainers)
    }

    @Test
    fun test_F020_AC2_anOwnerWhoDoesNotTrainIsAskedToChooseOne() {
        show(ready(trainers = listOf(sarah, tom), trainerId = null, mine = null), forAnyTrainer = true)

        compose.onNodeWithTag(NewSessionTags.TRAINER_VALUE)
            .assertTextEquals(
                string(R.string.sessions_form_trainer_choose, string(R.string.trainer_word_trainer_a_word)),
            )
    }

    @Test
    fun test_F020_AC1_theConfirmationNamesTheClientAndTheLanguageOfTheEmail() {
        show(ready(client = mark))

        compose.onNodeWithTag(NewSessionTags.NOTIFY).assertTextContains("Mark Jansen", substring = true)
        compose.onNodeWithTag(NewSessionTags.NOTIFY_NOTE)
            .assertTextEquals(
                string(
                    R.string.sessions_form_notify_note,
                    "mark@example.com",
                    string(R.string.sessions_form_language_en),
                ),
            )

        compose.onNodeWithTag(NewSessionTags.NOTIFY).performScrollTo().performClick()

        assertEquals(listOf(false), notify)
    }

    @Test
    fun test_F020_AC1_withoutAClientThereIsNoConfirmationToChoose() {
        show(ready())

        compose.onNodeWithTag(NewSessionTags.NOTIFY).assertDoesNotExist()
    }

    @Test
    fun test_F020_AC1_savingWithoutAClientSaysSoUnderTheClient() {
        show(ready(clientMissing = true))

        compose.onNodeWithTag(
            NewSessionTags.CLIENT_ERROR,
        ).assertTextEquals(string(R.string.sessions_form_errors_choose_client))
    }

    @Test
    fun test_F020_AC1_savingAsksTheHostWhenThereIsAConnection() {
        show(ready(client = anna))

        compose.onNodeWithTag(
            NewSessionTags.SAVE,
        ).assertIsEnabled().assertTextEquals(string(R.string.sessions_form_save))
        compose.onNodeWithTag(NewSessionTags.SAVE).performClick()

        assertEquals(1, saved)
    }

    // AC10: with no connection Opslaan is off, with the text that says why; nothing is queued.
    @Test
    fun test_F020_AC10_offlineDisablesSave() {
        show(ready(client = anna, load = NewSessionLoad.Offline))

        compose.onNodeWithTag(NewSessionTags.OFFLINE).assertTextEquals(string(R.string.sessions_form_offline))
        compose.onNodeWithTag(NewSessionTags.SAVE).assertIsNotEnabled()
        compose.onNodeWithTag(NewSessionTags.RETRY).performClick()
        assertEquals(1, retried)
        assertEquals(0, saved)
    }

    @Test
    fun test_F020_AC10_aSaveThatCouldNotReachTheApiKeepsTheFormAndTurnsSavingOff() {
        show(ready(client = anna, sawOffline = true))

        compose.onNodeWithTag(NewSessionTags.OFFLINE).assertIsDisplayed()
        compose.onNodeWithTag(NewSessionTags.CLIENT_NAME).assertTextEquals("Anna de Vries")
        compose.onNodeWithTag(NewSessionTags.SAVE).assertIsNotEnabled()
    }

    @Test
    fun test_F020_AC1_theApisMessageAboutATimeTheClocksSkipIsShownWithTheDay() {
        show(ready(start = LocalDateTime.of(2027, 3, 28, 2, 30), refusal = TimeRefusal.TimeDoesNotExist))

        val day = if (language == AppLanguage.DUTCH) "zo 28 mrt" else "Sun 28 Mar"
        compose.onNodeWithTag(
            "newSession.timeError",
        ).assertTextEquals(string(R.string.sessions_form_errors_time_does_not_exist, day))
    }

    @Test
    fun test_F020_AC1_aRefusedOrFailedSaveSaysSo() {
        show(ready(client = anna, failure = SaveFailure.NotSaved))
        compose.onNodeWithTag(NewSessionTags.FAILED).assertTextEquals(string(R.string.sessions_form_errors_not_saved))
    }

    @Test
    fun test_F020_AC2_aRefusedPlanSaysThereIsNoPermission() {
        show(ready(client = anna, failure = SaveFailure.NoPermission))
        compose.onNodeWithTag(
            NewSessionTags.FAILED,
        ).assertTextEquals(string(R.string.sessions_form_errors_no_permission))
    }

    @Test
    fun test_F020_AC2_aFormWithoutAccessSaysWhoToAskInTheWordsOfTheOtherScreens() {
        show(ready(load = NewSessionLoad.NoPermission))

        compose.onNodeWithTag(NewSessionTags.NO_PERMISSION).assertIsDisplayed()
        compose.onNodeWithText(string(R.string.no_permission_body, "John's Gym")).assertIsDisplayed()
    }

    @Test
    fun test_F020_AC10_theFormThatCouldNotBeLoadedSaysSoAndOffersARetry() {
        show(ready(load = NewSessionLoad.Failed))

        compose.onNodeWithTag(NewSessionTags.LOAD_FAILED).assertTextEquals(string(R.string.sessions_form_load_failed))
        compose.onNodeWithTag(NewSessionTags.SAVE).assertIsNotEnabled()
        compose.onNodeWithTag(NewSessionTags.RETRY).performClick()
        assertEquals(1, retried)
    }

    @Test
    fun test_F020_AC1_leavingWithSomethingEnteredAsksToDiscardOrKeepEditing() {
        show(ready(client = anna), confirmingDiscard = true)

        // The texts of a dialog are asserted through the app (PrivateSessionFlowTest): a dialog's window doesn't take the
        // test's language override.
        compose.onNodeWithTag(NewSessionTags.KEEP_EDITING).assertIsDisplayed()
        compose.onNodeWithTag(NewSessionTags.DISCARD).assertIsDisplayed()
        compose.onNodeWithTag(NewSessionTags.KEEP_EDITING).performClick()
        compose.onNodeWithTag(NewSessionTags.DISCARD).performClick()
        assertEquals(1, kept)
        assertEquals(1, discarded)
    }

    @Test
    fun test_F020_AC1_theCloseButtonAsksTheHost() {
        show(ready())

        compose.onNodeWithTag(NewSessionTags.CANCEL).performClick()

        assertEquals(1, closed)
    }

    @Test
    fun test_F020_AC1_theDateAndTheStartOpenTheMaterialPickers() {
        show(ready())

        compose.onNodeWithTag("newSession.date").performClick()
        compose.onNodeWithTag("newSession.datePicker").assertIsDisplayed()
        compose.onNodeWithTag("newSession.pickerDone").performClick()
        compose.onNodeWithTag("newSession.datePicker").assertDoesNotExist()

        compose.onNodeWithTag("newSession.start").performClick()
        compose.onNodeWithTag("newSession.timePicker").assertIsDisplayed()
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}

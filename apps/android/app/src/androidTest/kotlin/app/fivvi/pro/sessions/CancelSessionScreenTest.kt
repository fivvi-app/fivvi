package app.fivvi.pro.sessions

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import app.fivvi.api.models.Client
import app.fivvi.api.models.Locale
import app.fivvi.core.AppLanguage
import app.fivvi.core.R
import app.fivvi.core.appLanguageParameters
import app.fivvi.pro.clients.clientOf
import app.fivvi.pro.localizedString
import app.fivvi.pro.showAtLargestFontScale
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// PS-06 *Sessie annuleren?* (F026 AC1, AC1a, AC2, AC4, AC9) in both languages at the largest font scale: Anna de Vries with
// Sarah at John's Gym on Thursday 24 September 2026, 09:00-10:00 (Europe/Amsterdam).
@RunWith(Parameterized::class)
class CancelSessionScreenTest(@Suppress("UNUSED_PARAMETER") tag: String, private val language: AppLanguage) {
    @get:Rule
    val compose = createComposeRule()

    private val anna = clientOf("Anna de Vries", "anna@example.com", Client.EmailLocale.NL_NL)
    private val chosen = mutableListOf<CancelInitiator>()
    private var rescheduled = 0
    private var cancelledAnyway = 0
    private var submitted = 0
    private var back = 0

    private fun string(id: Int, vararg args: Any) = localizedString(language, id, *args)

    private fun state(
        initiator: CancelInitiator = CancelInitiator.Client,
        confirming: Boolean = false,
        canReschedule: Boolean = true,
        started: Boolean = false,
        failure: CancelFailure? = null,
        locale: Locale = Locale.NL_NL,
    ) = CancelSessionState(
        session = sessionOf(client = anna, trainer = trainerOf("Sarah")),
        clientName = "Anna de Vries",
        clientEmail = "anna@example.com",
        emailLocale = locale,
        canReschedule = canReschedule,
        started = started,
        initiator = initiator,
        notify = initiator == CancelInitiator.Workspace,
        confirming = confirming,
        failure = failure,
    )

    private fun show(state: CancelSessionState) = compose.showAtLargestFontScale(language) {
        CancelSessionScreen(
            state,
            CancelSessionActions(
                onChoose = { chosen += it },
                onNotify = {},
                onCancelAnyway = { cancelledAnyway++ },
                onReschedule = { rescheduled++ },
                onSubmit = { submitted++ },
                onBack = { back++ },
            ),
        )
    }

    @Test
    fun test_F026_AC1a_theQuestionOffersRescheduleAndCancelAnywayAndNoCancelButtonYet() {
        show(state())

        compose.onNodeWithTag(CancelSessionTags.TITLE).assertTextEquals(string(R.string.sessions_cancel_title))
        val day = if (language == AppLanguage.DUTCH) {
            "do 24 sep"
        } else {
            SessionFormat(java.util.Locale.UK, java.time.ZoneId.of("Europe/Amsterdam"))
                .day(sessionOf(client = anna).startsAt)
        }
        compose.onNodeWithTag(CancelSessionTags.SUBTITLE).assertTextEquals("Anna de Vries · $day, 09:00–10:00")
        compose.onNodeWithTag(CancelSessionTags.WHO_CLIENT).assertIsSelected()
        compose.onNodeWithTag(CancelSessionTags.NUDGE).assertTextEquals(string(R.string.sessions_cancel_nudge_question))
        compose.onNodeWithTag(
            CancelSessionTags.RESCHEDULE,
        ).assertTextEquals(string(R.string.sessions_cancel_nudge_reschedule))
        compose.onNodeWithTag(
            CancelSessionTags.CANCEL_ANYWAY,
        ).assertTextEquals(string(R.string.sessions_cancel_nudge_cancel_anyway))
        compose.onNodeWithTag(CancelSessionTags.SUBMIT).assertDoesNotExist()
        compose.onNodeWithTag(CancelSessionTags.NOTIFY).assertDoesNotExist()

        compose.onNodeWithTag(CancelSessionTags.RESCHEDULE).performClick()
        compose.onNodeWithTag(CancelSessionTags.CANCEL_ANYWAY).performClick()
        compose.onNodeWithTag(CancelSessionTags.BACK).assertTextEquals(string(R.string.sessions_cancel_back))
        compose.onNodeWithTag(CancelSessionTags.BACK).performClick()

        assertEquals(listOf(1, 1, 1), listOf(rescheduled, cancelledAnyway, back))
    }

    @Test
    fun test_F026_AC1_chosenWhoCancelsIsReportedAndWeSkipTheQuestion() {
        show(state(initiator = CancelInitiator.Workspace))

        compose.onNodeWithTag(CancelSessionTags.WHO_WORKSPACE).assertIsSelected()
        compose.onNodeWithTag(CancelSessionTags.NUDGE).assertDoesNotExist()
        compose.onNodeWithTag(CancelSessionTags.SUBMIT).assertTextEquals(string(R.string.sessions_cancel_submit))

        compose.onNodeWithTag(CancelSessionTags.WHO_CLIENT).performClick()

        assertEquals(listOf(CancelInitiator.Client), chosen)
    }

    @Test
    fun test_F026_AC2_theEmailBoxHasItsNoteWithTheClientsAddressAndLanguage() {
        show(state(initiator = CancelInitiator.Workspace, locale = Locale.EN))

        compose.onNodeWithTag(CancelSessionTags.NOTIFY).assertIsDisplayed()
        val language = string(R.string.sessions_form_language_en)
        compose.onNodeWithTag(CancelSessionTags.NOTIFY_NOTE).assertTextEquals("anna@example.com · $language")
    }

    @Test
    fun test_F026_AC9_aSessionThatHasStartedHasNoEmailBoxAndSaysNobodyIsTold() {
        show(state(initiator = CancelInitiator.Workspace, started = true))

        compose.onNodeWithTag(CancelSessionTags.NOTIFY).assertDoesNotExist()
        compose.onNodeWithTag(CancelSessionTags.STARTED).assertTextEquals(string(R.string.sessions_cancel_started))
        compose.onNodeWithTag(CancelSessionTags.SUBMIT).assertIsEnabled()
    }

    @Test
    fun test_F026_AC4_offlineTheButtonIsOffAndTheLineSaysWhy() {
        show(state(initiator = CancelInitiator.Workspace, failure = CancelFailure.Offline))

        compose.onNodeWithTag(CancelSessionTags.FAILED).assertTextEquals(string(R.string.sessions_cancel_offline))
        compose.onNodeWithTag(CancelSessionTags.SUBMIT).assertIsNotEnabled()
    }

    @Test
    fun test_F026_AC11_theApisWordsAreShownAsItWordsThem() {
        show(state(initiator = CancelInitiator.Workspace, failure = CancelFailure.Changed("Tom")))
        compose.onNodeWithTag(
            CancelSessionTags.FAILED,
        ).assertTextEquals(string(R.string.sessions_cancel_changed_by, "Tom"))
    }

    @Test
    fun test_F026_AC11_aSessionCancelledFirstCannotBeCancelledAgain() {
        show(state(initiator = CancelInitiator.Workspace, failure = CancelFailure.Cancelled))

        compose.onNodeWithTag(
            CancelSessionTags.FAILED,
        ).assertTextEquals(string(R.string.sessions_cancel_already_cancelled))
        compose.onNodeWithTag(CancelSessionTags.SUBMIT).assertIsNotEnabled()
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}

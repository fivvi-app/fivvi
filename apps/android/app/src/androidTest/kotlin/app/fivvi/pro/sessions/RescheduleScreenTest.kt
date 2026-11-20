package app.fivvi.pro.sessions

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import app.fivvi.api.models.Client
import app.fivvi.api.models.Locale
import app.fivvi.api.models.TrainerConflictItem
import app.fivvi.core.AppLanguage
import app.fivvi.core.R
import app.fivvi.core.appLanguageParameters
import app.fivvi.pro.clients.clientOf
import app.fivvi.pro.localizedString
import app.fivvi.pro.showAtLargestFontScale
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// PS-05 *Sessie verplaatsen* (F020 AC6, AC8), in both languages at the largest font scale: Anna's session with Sarah, moved
// with and without telling her.
@RunWith(Parameterized::class)
class RescheduleScreenTest(@Suppress("UNUSED_PARAMETER") tag: String, private val language: AppLanguage) {
    @get:Rule
    val compose = createComposeRule()

    private val anna = clientOf("Anna de Vries", "anna@example.com", Client.EmailLocale.NL_NL)
    private val session = sessionOf(client = anna, trainer = trainerOf("Sarah"))
    private var submitted = 0
    private var closed = 0
    private var savedAnyway = 0
    private var wentBack = 0
    private val notify = mutableListOf<Boolean>()

    private fun string(id: Int, vararg args: Any) = localizedString(language, id, *args)

    private fun state(
        notifyOn: Boolean = true,
        failure: RescheduleFailure? = null,
        refusal: TimeRefusal? = null,
        minutes: Int = 60,
        saving: Boolean = false,
        doubleBooking: DoubleBooking? = null,
    ) = RescheduleState(
        session,
        SessionTime(LocalDateTime.of(2026, 9, 24, 9, 0), minutes, refusal = refusal),
        notifyOn,
        failure,
        saving,
        doubleBooking = doubleBooking,
    )

    private fun show(state: RescheduleState) = compose.showAtLargestFontScale(language) {
        RescheduleScreen(
            state,
            "Anna de Vries",
            Locale.NL_NL,
            RescheduleActions(
                onClose = { closed++ },
                onSubmit = { submitted++ },
                onSaveAnyway = { savedAnyway++ },
                onDismissDoubleBooking = { wentBack++ },
                onNotify = { notify += it },
                time = SessionTimeActions({}, {}, {}, {}),
            ),
        )
    }

    @Test
    fun test_F020_AC6_theFormShowsWhereTheSessionIsNowAndItsLocationUnchanged() {
        show(state())

        compose.onNodeWithTag(RescheduleTags.TITLE).assertTextEquals(string(R.string.sessions_reschedule_title))
        compose.onNodeWithTag(
            RescheduleTags.SUBTITLE,
        ).assertTextEquals(string(R.string.sessions_reschedule_subtitle, "Anna de Vries"))
        val day = if (language == AppLanguage.DUTCH) {
            "do 24 sep 2026"
        } else {
            SessionFormat(java.util.Locale.UK, ZoneId.of("Europe/Amsterdam")).dayYear(session.startsAt)
        }
        compose.onNodeWithTag(RescheduleTags.CURRENT)
            .assertTextEquals(string(R.string.sessions_reschedule_current, day, "10:00", "John's Gym", "09:00"))
        compose.onNodeWithTag(RescheduleTags.LOCATION)
            .assertTextEquals(string(R.string.sessions_reschedule_location_unchanged, "John's Gym"))
    }

    @Test
    fun test_F020_AC6_withTheClientInformedTheButtonSaysRescheduleAndInform() {
        show(state(notifyOn = true))

        compose.onNodeWithTag(
            RescheduleTags.SUBMIT,
        ).assertTextEquals(string(R.string.sessions_reschedule_submit_notify))
        compose.onNodeWithTag(RescheduleTags.NOTIFY_NOTE)
            .assertTextEquals(
                string(
                    R.string.sessions_reschedule_notify_note,
                    "Anna de Vries",
                    string(R.string.sessions_form_language_nl),
                ),
            )
        compose.onNodeWithTag(RescheduleTags.NOTIFY).performScrollTo().performClick()
        assertEquals(listOf(false), notify)

        compose.onNodeWithTag(RescheduleTags.SUBMIT).performClick()
        assertEquals(1, submitted)
    }

    @Test
    fun test_F020_AC6_withoutInformingTheClientTheButtonSaysReschedule() {
        show(state(notifyOn = false))

        compose.onNodeWithTag(RescheduleTags.SUBMIT).assertTextEquals(string(R.string.sessions_reschedule_submit))
    }

    @Test
    fun test_F020_AC8_whenSomeoneElseChangedTheSessionTheFormSaysWho() {
        show(state(failure = RescheduleFailure.Changed("Tom")))

        compose.onNodeWithTag(
            RescheduleTags.FAILED,
        ).assertTextEquals(string(R.string.sessions_reschedule_changed_by, "Tom"))
    }

    @Test
    fun test_F020_AC8_whenTheApiDoesNotKnowWhoTheFormSaysSo() {
        show(state(failure = RescheduleFailure.Changed(null)))

        compose.onNodeWithTag(
            RescheduleTags.FAILED,
        ).assertTextEquals(string(R.string.sessions_reschedule_changed_by_unknown))
    }

    @Test
    fun test_F020_AC8_aCancelledOrRefusedOrUnsavedMoveSaysWhy() {
        show(state(failure = RescheduleFailure.Cancelled))
        compose.onNodeWithTag(RescheduleTags.FAILED).assertTextEquals(string(R.string.sessions_reschedule_cancelled))
    }

    @Test
    fun test_F020_AC7_aMoveTheApiRefusesSaysThereIsNoPermission() {
        show(state(failure = RescheduleFailure.NoPermission))
        compose.onNodeWithTag(
            RescheduleTags.FAILED,
        ).assertTextEquals(string(R.string.sessions_reschedule_no_permission))
    }

    @Test
    fun test_F020_AC6_aMoveThatWasNotSavedSaysSo() {
        show(state(failure = RescheduleFailure.NotSaved))
        compose.onNodeWithTag(RescheduleTags.FAILED).assertTextEquals(string(R.string.sessions_form_errors_not_saved))
    }

    @Test
    fun test_F020_AC6_theApisMessageAboutTheTimeIsShownUnderIt() {
        show(state(refusal = TimeRefusal.InvalidTime))
        compose.onNodeWithTag(
            "reschedule.timeError",
        ).assertTextEquals(string(R.string.sessions_form_errors_invalid_time))
    }

    @Test
    fun test_F020_AC6_whileTheMoveIsUnderWayTheButtonGivesWayToProgress() {
        show(state(saving = true))

        compose.onNodeWithTag(RescheduleTags.PENDING).assertIsDisplayed()
        compose.onNodeWithTag(RescheduleTags.SUBMIT).assertDoesNotExist()
    }

    @Test
    fun test_F023_AC6_theDoubleBookingAlertOffersBackAndSaveAnywayToTheHost() {
        val booking = DoubleBooking(
            listOf(
                TrainerConflictItem(
                    sessionIdOf("bob"),
                    TrainerConflictItem.Type.GROUP,
                    OffsetDateTime.parse("2026-09-24T08:00:00Z"),
                    OffsetDateTime.parse("2026-09-24T09:00:00Z"),
                    "Yoga voor iedereen",
                    "Yoga for everyone",
                ),
            ),
            trainerName = "Sarah",
        )
        show(state(doubleBooking = booking))

        // The texts of a dialog are asserted through the app (PrivateSessionFlowTest), as for the discard dialog.
        compose.onNodeWithTag(DoubleBookingTags.back(RescheduleTags.PREFIX)).assertIsDisplayed()
        compose.onNodeWithTag(DoubleBookingTags.saveAnyway(RescheduleTags.PREFIX)).assertIsDisplayed()
        compose.onNodeWithTag(DoubleBookingTags.back(RescheduleTags.PREFIX)).performClick()
        compose.onNodeWithTag(DoubleBookingTags.saveAnyway(RescheduleTags.PREFIX)).performClick()
        assertEquals(1, wentBack)
        assertEquals(1, savedAnyway)
        assertEquals(0, submitted)
    }

    @Test
    fun test_F023_AC13_withoutPermissionAnymoreTheFormSaysSo() {
        show(state(failure = RescheduleFailure.NoPermission))

        compose.onNodeWithTag(RescheduleTags.FAILED)
            .assertTextEquals(string(R.string.sessions_reschedule_no_permission))
    }

    @Test
    fun test_F020_AC6_theCloseButtonAsksTheHost() {
        show(state())

        compose.onNodeWithTag(RescheduleTags.CANCEL).performClick()

        assertEquals(1, closed)
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}

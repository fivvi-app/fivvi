package app.fivvi.pro.sessions

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import app.fivvi.api.models.Client
import app.fivvi.api.models.Session
import app.fivvi.core.AppLanguage
import app.fivvi.core.R
import app.fivvi.core.appLanguageParameters
import app.fivvi.pro.clients.clientIdOf
import app.fivvi.pro.clients.clientOf
import app.fivvi.pro.localizedString
import app.fivvi.pro.showAtLargestFontScale
import java.time.LocalDateTime
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// TD-02 *Privésessie* (F020 AC10 and the design), in both languages at the largest font scale: Anna de Vries with Sarah at
// John's Gym on Thursday 24 September 2026, 09:00-10:00 (Europe/Amsterdam).
@RunWith(Parameterized::class)
class SessionScreenTest(@Suppress("UNUSED_PARAMETER") tag: String, private val language: AppLanguage) {
    @get:Rule
    val compose = createComposeRule()

    private val anna = clientOf("Anna de Vries", "anna@example.com", Client.EmailLocale.NL_NL)
    private val sarah = trainerOf("Sarah")
    private val opened = mutableListOf<java.util.UUID>()
    private val routes = mutableListOf<String>()
    private var rescheduled = 0

    private fun string(id: Int, vararg args: Any) = localizedString(language, id, *args)

    private fun state(
        session: Session = sessionOf(client = anna, trainer = sarah),
        trainerIsMe: Boolean = true,
        moved: Session? = null,
    ) = SessionState(
        SessionLoad.Loaded,
        session,
        myTrainerId = sarah.id.takeIf { trainerIsMe },
        moved = moved,
    )

    private fun show(state: SessionState, mayMove: Boolean = true) = compose.showAtLargestFontScale(language) {
        SessionScreen(
            state,
            "John's Gym",
            SessionActions(
                onBack = {},
                onRetry = {},
                onReschedule = if (mayMove) ({ rescheduled++ }) else null,
                onOpenClient = { opened += it },
                onRoute = { routes += it },
            ),
        )
    }

    @Test
    fun test_F020_AC10_theSessionShowsTheTitleTheDateAndTheTimeInTheLanguageShown() {
        show(state())

        compose.onNodeWithTag(
            SessionTags.TITLE,
        ).assertTextEquals(string(R.string.sessions_page_heading, "Anna de Vries"))
        val day = if (language == AppLanguage.DUTCH) "donderdag 24 september 2026" else "Thursday 24 September 2026"
        compose.onNodeWithTag(SessionTags.WHEN).assertTextEquals("$day, 09:00–10:00")
    }

    @Test
    fun test_F020_AC10_theLocationHasARouteThatOpensTheMapsAppWithTheAddress() {
        show(state())

        compose.onNodeWithTag(SessionTags.LOCATION).assertTextEquals("John's Gym")
        compose.onNodeWithTag(SessionTags.ROUTE).assertTextEquals(string(R.string.sessions_page_route))

        compose.onNodeWithTag(SessionTags.ROUTE).performClick()

        assertEquals(
            listOf("https://www.google.com/maps/dir/?api=1&destination=Damrak%201%2C%201011AB%20Amsterdam"),
            routes,
        )
    }

    @Test
    fun test_F020_AC10_aLocationWithoutAnAddressHasNoRoute() {
        show(state(sessionOf(client = anna, trainer = sarah, location = gymLocation(null))))

        compose.onNodeWithTag(SessionTags.LOCATION).assertIsDisplayed()
        compose.onNodeWithTag(SessionTags.ROUTE).assertDoesNotExist()
    }

    @Test
    fun test_F020_AC10_theWorkspaceHasTheTrainerUnderItAndTheViewerIsYou() {
        show(state())

        compose.onNodeWithTag(SessionTags.WORKSPACE).assertTextEquals("John's Gym")
        compose.onNodeWithTag(SessionTags.TRAINER).assertTextEquals(string(R.string.sessions_page_you))
    }

    @Test
    fun test_F020_AC10_anotherTrainerIsShownByNameAndNoTrainerSaysSo() {
        show(state(trainerIsMe = false))
        compose.onNodeWithTag(SessionTags.TRAINER).assertTextEquals("Sarah")
    }

    @Test
    fun test_F020_AC10_aSessionWithoutATrainerSaysNoTrainerInTheWorkspacesWord() {
        show(state(sessionOf(client = anna, trainer = null), trainerIsMe = false))

        compose.onNodeWithTag(
            SessionTags.TRAINER,
        ).assertTextEquals(string(R.string.sessions_page_no_trainer, string(R.string.trainer_word_trainer_word)))
    }

    @Test
    fun test_F020_AC10_theClientOpensTheirProfile() {
        show(state())

        compose.onNodeWithTag(SessionTags.CLIENT).performClick()

        assertEquals(listOf(clientIdOf("Anna de Vries")), opened)
    }

    @Test
    fun test_F020_AC6_theMenuHasRescheduleAndClientProfile() {
        show(state())

        compose.onNodeWithTag(SessionTags.MENU).performClick()
        // The texts of a menu are asserted through the app (PrivateSessionFlowTest): a popup's window doesn't take the
        // test's language override.
        compose.onNodeWithTag(SessionTags.RESCHEDULE).assertIsDisplayed()
        compose.onNodeWithTag(SessionTags.CLIENT_PROFILE).assertIsDisplayed()

        compose.onNodeWithTag(SessionTags.RESCHEDULE).performClick()
        assertEquals(1, rescheduled)
    }

    @Test
    fun test_F020_AC7_withoutTheRightToPlanSessionsThereIsNoReschedule() {
        show(state(), mayMove = false)

        compose.onNodeWithTag(SessionTags.MENU).performClick()

        compose.onNodeWithTag(SessionTags.RESCHEDULE).assertDoesNotExist()
        compose.onNodeWithTag(SessionTags.CLIENT_PROFILE).assertIsDisplayed()
    }

    @Test
    fun test_F020_AC6_aCancelledSessionSaysSoAndCannotBeMoved() {
        show(state(sessionOf(client = anna, trainer = sarah, status = Session.Status.CANCELLED)))

        compose.onNodeWithTag(SessionTags.CANCELLED).assertTextEquals(string(R.string.sessions_page_cancelled))
        compose.onNodeWithTag(SessionTags.MENU).performClick()
        compose.onNodeWithTag(SessionTags.RESCHEDULE).assertDoesNotExist()
    }

    @Test
    fun test_F020_AC6_aMovedSessionSaysWhereItWent() {
        val moved = sessionOf(client = anna, trainer = sarah, start = LocalDateTime.of(2026, 9, 25, 10, 0), version = 2)
        show(state(moved, moved = moved))

        val day = if (language == AppLanguage.DUTCH) {
            "vr 25 sep"
        } else {
            SessionFormat(java.util.Locale.UK, ZoneId.of("Europe/Amsterdam")).day(moved.startsAt)
        }
        compose.onNodeWithTag(SessionTags.MOVED).assertTextEquals(string(R.string.sessions_page_moved, day, "10:00"))
    }

    @Test
    fun test_F020_AC10_theStatesOfALoadAreTheWebs() {
        show(SessionState(SessionLoad.Loading))
        compose.onNodeWithTag(SessionTags.LOADING).assertIsDisplayed()
    }

    @Test
    fun test_F020_AC10_aFailedLoadOffersARetry() {
        show(SessionState(SessionLoad.Failed))

        compose.onNodeWithTag(SessionTags.ERROR).assertTextEquals(string(R.string.sessions_form_load_failed))
        compose.onNodeWithTag(SessionTags.RETRY).assertTextEquals(string(R.string.common_retry))
    }

    @Test
    fun test_F020_AC10_aSessionTheApiRefusesSaysThereIsNoAccess() {
        show(SessionState(SessionLoad.NoPermission))

        compose.onNodeWithTag(SessionTags.NO_PERMISSION).assertIsDisplayed()
        assertTrue(routes.isEmpty())
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}

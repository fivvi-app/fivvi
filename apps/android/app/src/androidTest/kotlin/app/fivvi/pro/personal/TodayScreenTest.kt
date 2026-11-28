package app.fivvi.pro.personal

import android.content.res.Configuration
import android.os.LocaleList as PlatformLocaleList
import androidx.annotation.PluralsRes
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.DeviceConfigurationOverride
import androidx.compose.ui.test.Locales
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.SemanticsNodeInteractionCollection
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.text.intl.LocaleList
import androidx.compose.ui.unit.dp
import androidx.test.core.app.ApplicationProvider
import app.fivvi.api.models.ClassLevel
import app.fivvi.api.models.MyDay
import app.fivvi.core.AppLanguage
import app.fivvi.core.R
import app.fivvi.core.appLanguageParameters
import app.fivvi.core.theme.FivviTheme
import app.fivvi.pro.FivviApplication
import app.fivvi.pro.attendance.QueueState
import app.fivvi.pro.home.NewMenu
import app.fivvi.pro.localizedString
import app.fivvi.pro.personal.PersonalFixtures.at
import app.fivvi.pro.sessions.SessionFormat
import app.fivvi.pro.showAtLargestFontScale
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.util.Locale
import java.util.UUID
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// TD-01 *Vandaag* (F013 AC1, AC2, AC5, AC7, AC8, AC14 and the design of DECISIONS.md §3, Android), in nl-NL and en: Sarah's
// Tuesday 22 September 2026 at 08:35, on the team of John's Gym and the owner of Sarah Personal Training (synthetic).
@RunWith(Parameterized::class)
class TodayScreenTest(@Suppress("UNUSED_PARAMETER") tag: String, private val language: AppLanguage) {
    @get:Rule
    val compose = createComposeRule()

    private val opened = mutableListOf<UUID>()
    private val planned = mutableListOf<OffsetDateTime>()
    private val tomorrows = mutableListOf<String>()
    private val routes = mutableListOf<String>()
    private var dismissed = 0
    private var droppedDismissed = 0
    private var refreshed = 0
    private val amsterdam = ZoneId.of("Europe/Amsterdam")

    private fun string(id: Int, vararg args: Any) = localizedString(language, id, *args)

    private fun plural(@PluralsRes id: Int, quantity: Int, vararg args: Any): String {
        val app = ApplicationProvider.getApplicationContext<FivviApplication>()
        val configuration = Configuration(app.resources.configuration).apply {
            setLocales(PlatformLocaleList(language.locale))
        }
        return app.createConfigurationContext(configuration).resources.getQuantityString(id, quantity, *args)
    }

    private fun loaded(
        day: MyDay = PersonalFixtures.sarah(),
        offline: Boolean = false,
        failed: Boolean = false,
        notices: List<String> = emptyList(),
    ) = TodayState(
        load = TodayLoad.Loaded,
        day = day,
        isOffline = offline,
        updateFailed = failed,
        updatedAt = PersonalFixtures.now,
        notices = notices,
        now = PersonalFixtures.now,
    )

    private fun actions(canPlan: Boolean = true) = TodayActions(
        onRefresh = { refreshed++ },
        onOpen = { opened += it.id },
        onRoute = { routes += it },
        onPlan = if (canPlan) ({ planned += it }) else null,
        onOpenTomorrow = { tomorrows += it },
        onDismissNotices = { dismissed++ },
        onDismissDroppedTaps = { droppedDismissed++ },
    )

    // The phone is tall enough for the whole day: a list shows only what is on screen.
    private fun show(
        state: TodayState,
        actions: TodayActions = actions(),
        device: ZoneId = amsterdam,
        now: Instant = PersonalFixtures.now,
        queue: QueueState = QueueState(),
    ) = compose.setContent {
        DeviceConfigurationOverride(DeviceConfigurationOverride.Locales(LocaleList(language.tag))) {
            FivviTheme {
                Box(Modifier.size(360.dp, 2600.dp)) { TodayScreen(state, actions, device, now, queue = queue) }
            }
        }
    }

    private fun tag(tag: String) = compose.onNodeWithTag(tag, useUnmergedTree = true)

    private fun rowOf(id: String) = compose.onNodeWithTag(TodayTags.row(PersonalFixtures.sessionIdOf(id)))

    private fun texts(text: String, substring: Boolean = false) =
        compose.onAllNodes(hasText(text, substring = substring), useUnmergedTree = true)

    private fun SemanticsNodeInteractionCollection.assertCountAtLeast(count: Int) =
        assertTrue("at least $count nodes", fetchSemanticsNodes().size >= count)

    // The one name a row has for TalkBack.
    private fun SemanticsNodeInteraction.names(): String =
        fetchSemanticsNode().config.getOrNull(SemanticsProperties.ContentDescription).orEmpty().joinToString()

    private fun SemanticsNodeInteraction.assertNamed(vararg parts: String) {
        val name = names()
        parts.forEach { assertTrue("'$name' lacks '$it'", name.contains(it)) }
    }

    @Test
    fun test_F013_AC1_todayShowsMyDayAcrossWorkspaces() {
        show(loaded())

        tag(TodayTags.TITLE).assertTextEquals(string(R.string.my_day_app_title))
        tag(TodayTags.EYEBROW).assertIsDisplayed()
        tag(TodayTags.SUMMARY).assertTextEquals(plural(R.plurals.my_day_app_summary, 4, 4, "0", "09:00", "19:00"))
        tag(TodayTags.NEXT).assertIsDisplayed()
        texts(string(R.string.my_day_next_upcoming, "25")).assertCountEquals(1)
        texts("Anna de Vries").assertCountEquals(1)
        compose.onNodeWithTag(TodayTags.NEXT_OPEN).assertTextEquals(string(R.string.my_day_app_open))
        // The next item is not repeated; every other one is a row named with its type, and a cancelled one says so.
        rowOf("anna").assertDoesNotExist()
        rowOf("mark").assertNamed("Mark Jansen", string(R.string.my_day_type_private).lowercase(), "John's Gym")
        rowOf("kracht-late").assertNamed(string(R.string.my_day_cancelled))
        rowOf("mark").performClick()
        assertEquals(listOf(PersonalFixtures.sessionIdOf("mark")), opened)
    }

    // F067 AC5, AC6, AC8: Vandaag's row of a class with a level shows the bars after the name and names the level after the
    // class name; *Alle niveaus*, *Geen* and the next card show no icon.
    private val reformer = PersonalFixtures.session(
        "reformer",
        PersonalFixtures.johns,
        "15:30",
        "16:30",
        className = "Reformer Power",
        booked = 2,
        capacity = 8,
        level = ClassLevel.ADVANCED,
    )

    private fun levelTag(id: String) = "today.level.${PersonalFixtures.sessionIdOf(id)}"

    @Test
    fun test_F067_AC5_aClassRowShowsTheBarsAfterTheNameAndTalkBackReadsTheLevelAfterTheName() {
        show(loaded(PersonalFixtures.sarah(items = listOf(PersonalFixtures.anna, reformer))))

        tag(levelTag("reformer")).assertIsDisplayed()
        val level = string(R.string.class_level_accessible_name, string(R.string.class_level_advanced))
        rowOf("reformer").assertNamed(string(R.string.my_day_spoken_join, "Reformer Power", level))
        // The bars have no word beside them in a row.
        texts(string(R.string.class_level_advanced)).assertCountEquals(0)
        rowOf("reformer").performClick()
        assertEquals("the row only opens", listOf(PersonalFixtures.sessionIdOf("reformer")), opened)
    }

    @Test
    fun test_F067_AC6_aDateWithAlleNiveausOrGeenShowsNoIconInTheRow() {
        val alle = PersonalFixtures.session(
            "alle",
            PersonalFixtures.johns,
            "17:00",
            "18:00",
            className = "Kracht",
            booked = 0,
            capacity = 8,
            level = ClassLevel.ALL_LEVELS,
        )
        show(loaded(PersonalFixtures.sarah(items = listOf(PersonalFixtures.anna, alle, PersonalFixtures.kracht))))

        tag(TodayTags.NEXT).assertIsDisplayed()
        compose.onAllNodes(hasTestTag(levelTag("alle")), useUnmergedTree = true).assertCountEquals(0)
        compose.onAllNodes(hasTestTag(levelTag("kracht")), useUnmergedTree = true).assertCountEquals(0)
        assertTrue(!rowOf("alle").names().contains(string(R.string.class_level_accessible_name, "").trim()))
    }

    @Test
    fun test_F067_AC5_theNextCardShowsNoIcon() {
        show(loaded(PersonalFixtures.sarah(items = listOf(reformer, PersonalFixtures.mark))))

        tag(TodayTags.NEXT).assertIsDisplayed()
        compose.onAllNodes(hasTestTag(levelTag("reformer")), useUnmergedTree = true).assertCountEquals(0)
    }

    @Test
    fun test_F013_AC1_theNextCardOpensItsItem() {
        show(loaded())

        tag(TodayTags.NEXT_OPEN).performClick()

        assertEquals(listOf(PersonalFixtures.sessionIdOf("anna")), opened)
    }

    @Test
    fun test_F013_AC1_inProgressReadsNuBezig() {
        show(loaded(), now = at("09:05").toInstant())

        texts(string(R.string.my_day_next_in_progress)).assertCountEquals(1)
    }

    @Test
    fun test_F013_AC2_workspaceLabelOnlyWithSeveralWorkspaces() {
        show(loaded())

        // Every row and the next card name their workspace, with its colour dot.
        texts("Sarah Personal Training", substring = true).assertCountAtLeast(1)
        rowOf("mark").assertNamed("John's Gym")
        assertEquals("the place and the workspace", 2, Regex("John's Gym").findAll(rowOf("mark").names()).count())
    }

    @Test
    fun test_F013_AC2_aSingleWorkspaceShowsNoNameAndNoDot() {
        val tom = PersonalFixtures.sarah(
            items = listOf(
                PersonalFixtures.session("early", PersonalFixtures.johns, "09:00", "10:00", client = "Eva Visser"),
                PersonalFixtures.mark,
            ),
            workspaceCount = 1,
        )
        show(loaded(tom))

        tag(TodayTags.NEXT).assertIsDisplayed()
        texts("Sarah Personal Training", substring = true).assertCountEquals(0)
        assertEquals("its place once, no workspace", 1, Regex("John's Gym").findAll(rowOf("mark").names()).count())
    }

    @Test
    fun test_F013_design_theMijnDagCardAndTheNextCard() {
        show(loaded())

        tag(TodayTags.CARD).assertIsDisplayed()
        tag(TodayTags.CARD_GAP).assertTextEquals(string(R.string.my_day_app_free_gap, "12:00", "13:30"))
        val locale = Locale.forLanguageTag(if (language == AppLanguage.DUTCH) "nl-NL" else "en-GB")
        val hours = TodayContent.hours(1.5, locale)
        texts(string(R.string.my_day_app_free_gap_length, hours)).assertCountEquals(1)
        tag(TodayTags.CARD_ROUTE).assertIsDisplayed()
        texts("TrainMore Zuid → John's Gym").assertCountEquals(1)
        tag(TodayTags.CARD_PLAN).assertIsEnabled().performClick()
        assertEquals("Plannen hands PS-04 the start of the gap", listOf(at("12:00")), planned)
        tag(TodayTags.NEXT_OPEN).assertIsDisplayed()
    }

    @Test
    fun test_F013_design_oneOrNoPlaceAheadLeavesOutTheRouteAndNoGapSaysSo() {
        show(loaded(PersonalFixtures.sarah(gap = null, places = listOf("John's Gym"))))

        tag(TodayTags.CARD_NO_FREE_TIME).assertTextEquals(string(R.string.my_day_app_no_free_time))
        tag(TodayTags.CARD_ROUTE).assertDoesNotExist()
        tag(TodayTags.CARD_PLAN).assertDoesNotExist()
    }

    @Test
    fun test_F013_design_planIsOffWhereThePersonMayNotPlanSessions() {
        show(loaded(), actions(canPlan = false))

        tag(TodayTags.CARD_PLAN).assertIsNotEnabled()
    }

    @Test
    fun test_F013_design_theKindLabelsAndThePillOnlyWhereThereAreClasses() {
        show(loaded())
        texts(string(R.string.my_day_type_group)).assertCountAtLeast(1)
        texts(string(R.string.my_day_type_private)).assertCountAtLeast(1)
        texts(string(R.string.my_calendar_block_booked, "0", "8")).assertCountAtLeast(1)
    }

    @Test
    fun test_F013_design_privateSessionsOnlyShowNoKindLabelAndNoGroupFigure() {
        show(
            loaded(
                PersonalFixtures.sarah(
                    items = listOf(PersonalFixtures.anna, PersonalFixtures.mark),
                    workspaceCount = 1,
                    showsKindLabel = false,
                ),
            ),
        )

        tag(TodayTags.NEXT).assertIsDisplayed()
        texts(string(R.string.my_day_type_group)).assertCountEquals(0)
        texts(string(R.string.my_day_type_private)).assertCountEquals(0)
        texts(string(R.string.my_calendar_block_booked, "0", "8")).assertCountEquals(0)
        // The accessible name still names the type.
        rowOf("mark").assertNamed(string(R.string.my_day_type_private).lowercase())
    }

    @Test
    fun test_F013_1534_aDayOfOnlyPrivateSessionsStillNamesTheKindWhenTheApiSaysSo() {
        show(loaded(PersonalFixtures.sarah(items = listOf(PersonalFixtures.anna, PersonalFixtures.mark))))

        tag(TodayTags.NEXT).assertIsDisplayed()
        texts(string(R.string.my_day_type_private)).assertCountAtLeast(1)
        texts(string(R.string.my_day_type_group)).assertCountEquals(0)
    }

    @Test
    fun test_F013_design_aFullClassReadsVol() {
        val full = PersonalFixtures.session(
            "full",
            PersonalFixtures.johns,
            "17:00",
            "18:00",
            className = "Kracht",
            booked = 8,
            capacity = 8,
        )
        show(loaded(PersonalFixtures.sarah(items = listOf(PersonalFixtures.anna, PersonalFixtures.kracht, full))))

        texts(string(R.string.my_day_app_full)).assertCountEquals(1)
    }

    @Test
    fun test_F013_AC5_theEmptyTextAndTheTomorrowLine() {
        show(loaded(PersonalFixtures.empty(tomorrow = true)))

        tag(TodayTags.SUMMARY).assertTextEquals(string(R.string.my_day_app_summary_empty))
        tag(TodayTags.EMPTY).assertTextEquals(string(R.string.my_day_empty_today))
        tag(TodayTags.TOMORROW).assertIsDisplayed()
        texts(plural(R.plurals.my_day_tomorrow, 3, 3, "07:00")).assertCountEquals(1)
        tag(TodayTags.TOMORROW).performClick()
        assertEquals("the line opens Agenda on that day", listOf("2026-09-23"), tomorrows)
    }

    @Test
    fun test_F013_AC5_theEmptyTextNamesTheNextSessionOrSaysThereAreNone() {
        show(loaded(PersonalFixtures.empty(nextSession = "2026-10-01")))
        val date = SessionFormat(
            Locale.forLanguageTag(
                if (language ==
                    AppLanguage.DUTCH
                ) {
                    "nl-NL"
                } else {
                    "en-GB"
                },
            ),
            amsterdam,
        )
            .day(LocalDate.parse("2026-10-01"))
        tag(TodayTags.EMPTY).assertTextEquals(string(R.string.my_day_empty_next, date))
        tag(TodayTags.TOMORROW).assertDoesNotExist()
    }

    @Test
    fun test_F013_AC5_aPersonWithNoSessionsAtAllIsToldSo() {
        show(loaded(PersonalFixtures.empty(hasSessions = false)))

        tag(TodayTags.EMPTY).assertTextEquals(string(R.string.my_day_empty_never))
    }

    @Test
    fun test_F013_AC7_offlineShowsCachedDay() {
        show(loaded(offline = true))

        tag(TodayTags.OFFLINE).assertTextEquals(string(R.string.my_day_app_offline, "08:35"))
        rowOf("mark").assertIsDisplayed()
        tag(TodayTags.CARD_PLAN).assertIsNotEnabled()
        tag(TodayTags.FAILED).assertDoesNotExist()
    }

    @Test
    fun test_F013_AC7_aFailureThatIsNotTheConnectionKeepsTheDayWithOpnieuw() {
        show(loaded(failed = true))

        tag(TodayTags.FAILED).assertTextEquals(string(R.string.my_day_app_failed))
        rowOf("mark").assertIsDisplayed()
        tag(TodayTags.RETRY).performClick()
        assertEquals(1, refreshed)
    }

    @Test
    fun test_F013_AC7_withNothingKeptTheErrorStateHasOneOpnieuw() {
        show(TodayState(load = TodayLoad.Failed, updateFailed = false, now = PersonalFixtures.now))

        tag(TodayTags.FAILED).assertTextEquals(string(R.string.my_day_app_failed))
        compose.onAllNodes(hasTestTag(TodayTags.RETRY), useUnmergedTree = true).assertCountEquals(1)
    }

    @Test
    fun test_F013_AC7_theErrorStateWithoutAConnectionSaysSoWithOpnieuw() {
        show(TodayState(load = TodayLoad.Failed, isOffline = true, now = PersonalFixtures.now))

        tag(TodayTags.OFFLINE).assertTextEquals(string(R.string.common_offline))
        tag(TodayTags.RETRY).assertIsDisplayed()
        tag(TodayTags.FAILED).assertDoesNotExist()
    }

    @Test
    fun test_F013_AC7_loadingShowsSkeletonRows() {
        show(TodayState(now = PersonalFixtures.now))

        tag(TodayTags.LOADING).assertIsDisplayed()
        tag(TodayTags.SUMMARY).assertDoesNotExist()
    }

    @Test
    fun test_F013_AC8_removedWorkspaceNoticeOnce() {
        show(loaded(notices = listOf("John's Gym")))

        tag(TodayTags.NOTICE).assertTextEquals(string(R.string.my_day_app_removed, "John's Gym"))
        compose.onNodeWithTag(
            TodayTags.NOTICE_DISMISS,
        ).assertTextEquals(string(R.string.my_day_app_dismiss)).performClick()
        assertEquals(1, dismissed)
    }

    // F025 (#549, the owner's decision (a)): taps made before the account was known could not be sent after a 401 and a new
    // sign-in; Vandaag says how many, with a button to dismiss it, and says nothing when none were dropped.
    @Test
    fun test_F025_1620_droppedTapsNoticeSaysHowManyAndGoesWhenDismissed() {
        show(loaded(), queue = QueueState(droppedTaps = 3))

        tag(TodayTags.DROPPED_TAPS).assertTextEquals(plural(R.plurals.attendance_app_dropped_taps, 3, 3))
        compose.onNodeWithTag(
            TodayTags.DROPPED_TAPS_DISMISS,
        ).assertTextEquals(string(R.string.my_day_app_dismiss)).performClick()
        assertEquals(1, droppedDismissed)
        assertEquals("the removed-workspace notice has its own button", 0, dismissed)
    }

    @Test
    fun test_F025_1620_droppedTapsNoticeSaysOneInTheSingular() {
        show(loaded(), queue = QueueState(droppedTaps = 1))

        tag(TodayTags.DROPPED_TAPS).assertTextEquals(plural(R.plurals.attendance_app_dropped_taps, 1, 1))
    }

    @Test
    fun test_F025_1620_noDroppedTapsNoNotice() {
        show(loaded())

        tag(TodayTags.DROPPED_TAPS).assertDoesNotExist()
    }

    @Test
    fun test_F013_AC14_timesInAmsterdamWithHint() {
        show(loaded(), device = ZoneId.of("America/New_York"))

        tag(TodayTags.TIME_ZONE_HINT).assertTextEquals(string(R.string.personal_time_zone_hint))
        // The times stay in Dutch time, whatever the phone's zone.
        texts("11:00").assertCountAtLeast(1)
    }

    @Test
    fun test_F013_AC14_noHintOnDutchTime() {
        show(loaded(), device = ZoneId.of("Europe/Berlin"))

        tag(TodayTags.TIME_ZONE_HINT).assertDoesNotExist()
    }

    @Test
    fun test_F013_design_theRowsAndTheCardKeepTheirButtonsAtTheLargestFontScale() {
        compose.showAtLargestFontScale(language, height = 5000.dp) {
            TodayScreen(loaded(), actions(), amsterdam, PersonalFixtures.now)
        }

        tag(TodayTags.CARD_PLAN).assertHeightIsAtLeast(48.dp)
        tag(TodayTags.NEXT_OPEN).assertHeightIsAtLeast(48.dp)
        assertTrue(routes.isEmpty())
    }

    @Test
    fun test_F013_design_theTitleKeepsItsWidthBesideThePlus() {
        val plus = TodayActions({}, {}, {}, null, {}, {}, menu = { NewMenu({}, {}, null, Modifier, enabled = !it) })
        show(loaded(), plus)

        tag(TodayTags.TITLE).assertIsDisplayed().assertWidthIsAtLeast(48.dp)
        tag("home.new").assertIsDisplayed()
    }

    @Test
    fun test_F013_AC7_thePlusIsOffWhileOfflineWithTheReasonAsItsState() {
        val reason = string(R.string.common_offline)
        val plus = TodayActions(
            {},
            {},
            {},
            null,
            {},
            {},
            menu = { offline ->
                NewMenu({}, {}, null, Modifier, enabled = !offline, disabledReason = if (offline) reason else null)
            },
        )
        show(loaded(offline = true), plus)

        tag("home.new").assertIsNotEnabled()
        assertEquals(
            reason,
            tag("home.new").fetchSemanticsNode().config.getOrNull(SemanticsProperties.StateDescription),
        )
    }

    @Test
    fun test_F013_AC7_thePlusStaysOnWhileOnline() {
        show(
            loaded(),
            TodayActions({
            }, {}, {}, null, {}, {}, menu = { NewMenu({}, {}, null, Modifier, enabled = !it) }),
        )

        tag("home.new").assertIsEnabled()
    }

    @Test
    fun test_F013_design_aRowWithAnAddressHasTheArrowToTheMapsApp() {
        show(loaded())

        tag(TodayTags.route(PersonalFixtures.sessionIdOf("mark"))).performClick()

        assertEquals(1, routes.size)
        assertTrue(routes.single().startsWith("https://www.google.com/maps/dir/"))
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}

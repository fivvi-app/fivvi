package app.fivvi.pro.personal

import android.content.res.Configuration
import android.os.LocaleList as PlatformLocaleList
import androidx.annotation.PluralsRes
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.DeviceConfigurationOverride
import androidx.compose.ui.test.Locales
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertContentDescriptionEquals
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeLeft
import androidx.compose.ui.test.swipeRight
import androidx.compose.ui.text.intl.LocaleList
import androidx.compose.ui.unit.dp
import androidx.test.core.app.ApplicationProvider
import app.fivvi.api.models.ClassLevel
import app.fivvi.api.models.PersonalSession
import app.fivvi.core.AppLanguage
import app.fivvi.core.R
import app.fivvi.core.appLanguageParameters
import app.fivvi.core.me.FakeMeApi
import app.fivvi.core.theme.FivviTheme
import app.fivvi.core.theme.tokens
import app.fivvi.designtokens.TokenColors
import app.fivvi.pro.FivviApplication
import app.fivvi.pro.localizedString
import app.fivvi.pro.personal.PersonalFixtures.at
import app.fivvi.pro.waitUntilTagExists
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

// TD-04 *Agenda* (F013 AC4, AC6, AC7, AC14, AC15 and the design of DECISIONS.md §3, Android), in nl-NL and en: Sarah's Tuesday
// 22 September 2026 at 08:35, who trains in John's Gym and Sarah Personal Training (synthetic), and for AC6 Thursday
// 22 October 2026, in the week the clocks go back. Agenda is driven by its own view model on a fake API.
@RunWith(Parameterized::class)
class AgendaScreenTest(@Suppress("UNUSED_PARAMETER") tag: String, private val language: AppLanguage) {
    @get:Rule
    val compose = createComposeRule()

    private val me = FakeMeApi()
    private val opened = mutableListOf<UUID>()
    private lateinit var model: AgendaViewModel
    private lateinit var tokens: TokenColors

    private fun string(id: Int, vararg args: Any) = localizedString(language, id, *args)

    private fun plural(@PluralsRes id: Int, quantity: Int, vararg args: Any): String {
        val app = ApplicationProvider.getApplicationContext<FivviApplication>()
        val configuration = Configuration(app.resources.configuration).apply {
            setLocales(PlatformLocaleList(language.locale))
        }
        return app.createConfigurationContext(configuration).resources.getQuantityString(id, quantity, *args)
    }

    private fun day(text: String) = LocalDate.parse(text)

    private val lisa = PersonalFixtures.session(
        "lisa",
        PersonalFixtures.johns,
        "11:00",
        "12:00",
        client = "Lisa Smit",
    )

    // The phone is tall enough for the whole week: a list shows only what is on screen.
    private fun show(
        items: List<PersonalSession> = PersonalFixtures.septemberWeek + lisa,
        now: Instant = PersonalFixtures.now,
        prepare: AgendaViewModel.() -> Unit = {},
    ) {
        me.sessions = items
        model = AgendaViewModel(me, MemoryPersonalStore(), { now }, Dispatchers.Unconfined)
        model.prepare()
        compose.setContent {
            DeviceConfigurationOverride(DeviceConfigurationOverride.Locales(LocaleList(language.tag))) {
                FivviTheme {
                    tokens = MaterialTheme.tokens
                    Box(Modifier.size(360.dp, 2600.dp)) {
                        AgendaTab(model, onOpen = { opened += it.id }, onRoute = {}, menu = {})
                    }
                }
            }
        }
        compose.waitUntilTagExists(AgendaTags.TITLE)
    }

    private fun tag(tag: String) = compose.onNodeWithTag(tag, useUnmergedTree = true)

    private fun exists(tag: String) =
        compose.onAllNodes(hasTestTag(tag), useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty()

    private fun dayButton(date: String) = tag(AgendaTags.day(day(date)))

    private fun block(id: String) = tag(AgendaTags.block(PersonalFixtures.sessionIdOf(id)))

    private fun rowTag(id: String) = "${AgendaTags.ROWS}.row.${PersonalFixtures.sessionIdOf(id)}"

    private fun row(id: String) = tag(rowTag(id))

    private fun SemanticsNodeInteraction.names(): String =
        fetchSemanticsNode().config.getOrNull(SemanticsProperties.ContentDescription).orEmpty().joinToString()

    // What a control reads as for a person: its own text and its children's, as TalkBack and the user see it.
    private fun merged(tag: String) = compose.onNodeWithTag(tag)

    private fun noNodeTagged(prefix: String) = compose.onAllNodes(
        SemanticsMatcher("a tag that starts with $prefix") {
            it.config.getOrNull(SemanticsProperties.TestTag)?.startsWith(prefix) == true
        },
        useUnmergedTree = true,
    ).assertCountEquals(0)

    @Test
    fun test_F013_design_agendaOffersDagWeekAndMaandUnderTheTitleAndVandaagInTheBar() {
        show()
        compose.waitUntilTagExists(AgendaTags.WEEK_LINE)

        tag(AgendaTags.TITLE).assertTextEquals(string(R.string.my_calendar_app_title))
        tag(AgendaTags.MODE_DAY).assertIsNotSelected()
        tag(AgendaTags.MODE_WEEK).assertIsSelected()
        tag(AgendaTags.MODE_MONTH).assertIsNotSelected()
        merged(AgendaTags.MODE_DAY).assertTextEquals(string(R.string.my_calendar_view_day))
        merged(AgendaTags.MODE_WEEK).assertTextEquals(string(R.string.my_calendar_view_week))
        merged(AgendaTags.MODE_MONTH).assertTextEquals(string(R.string.my_calendar_app_view_month))
        merged(AgendaTags.TODAY).assertTextEquals(string(R.string.my_calendar_today)).assertIsDisplayed()
    }

    // F067 AC5, AC6, AC8: a row of Agenda (Week) shows the bars after the class name of a date with a level, names the level
    // after the class name, shows nothing for *Alle niveaus* and *Geen*; a block of Dag shows no icon.
    @Test
    fun test_F067_AC5_aRowOfAgendaShowsTheBarsAndNamesTheLevelAfterTheClassName() {
        val reformer = PersonalFixtures.session(
            "reformer",
            PersonalFixtures.johns,
            "15:30",
            "16:30",
            className = "Reformer Power",
            booked = 2,
            capacity = 8,
            level = ClassLevel.ADVANCED,
        )
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
        show(PersonalFixtures.septemberWeek + reformer + alle)
        compose.waitUntilTagExists(AgendaTags.WEEK_LINE)

        assertTrue(exists("${AgendaTags.ROWS}.level.${PersonalFixtures.sessionIdOf("reformer")}"))
        val level = string(R.string.class_level_accessible_name, string(R.string.class_level_advanced))
        assertTrue(
            row("reformer").names().contains(string(R.string.my_day_spoken_join, "Reformer Power", level)),
        )
        assertFalse(exists("${AgendaTags.ROWS}.level.${PersonalFixtures.sessionIdOf("alle")}"))
        assertFalse(row("alle").names().contains(string(R.string.class_level_accessible_name, "").trim()))
        assertFalse(exists("${AgendaTags.ROWS}.level.${PersonalFixtures.sessionIdOf("kracht")}"))

        tag(AgendaTags.MODE_DAY).performClick()
        compose.waitUntilTagExists(AgendaTags.TIMELINE)
        assertFalse(
            "a block of Dag has no icon",
            exists("${AgendaTags.ROWS}.level.${PersonalFixtures.sessionIdOf("reformer")}"),
        )
        assertTrue(
            "a block of Dag still names the level for TalkBack",
            block("reformer").names().contains(level),
        )
    }

    @Test
    fun test_F013_design_dagShowsTheDayAsATimelineWithTwoAtTheSameTimeSideBySideAndTheNowLine() {
        show { show(AgendaMode.Day) }
        compose.waitUntilTagExists(AgendaTags.TIMELINE)

        val mark = block("mark").getBoundsInRoot()
        val lisa = block("lisa").getBoundsInRoot()
        assertEquals("at the same time", mark.top.value, lisa.top.value, 1f)
        assertTrue("side by side: $mark, $lisa", mark.right.value <= lisa.left.value + 1f)
        assertTrue(block("mark").names().contains("Mark Jansen"))
        val anna = block("anna").getBoundsInRoot()
        assertTrue(
            "alone it takes the width of the day",
            (anna.right - anna.left).value > (mark.right - mark.left).value * 1.5f,
        )
        val now = tag(AgendaTags.NOW)
        assertEquals(string(R.string.my_calendar_app_now, "08:35"), now.names())
        assertTrue("08:35 is above the 09:00 session", now.getBoundsInRoot().top.value < anna.top.value)
        assertTrue(
            "a cancelled block is marked",
            block("kracht-late").names().contains(string(R.string.my_day_cancelled)),
        )
        listOf("mark", "lisa", "anna", "kracht-late").forEach {
            block(it).assertHeightIsAtLeast(48.dp).assertWidthIsAtLeast(48.dp)
        }
        // A block is a button for TalkBack too, not only for a finger: the click action is on the node it is named by.
        block("mark").assertHasClickAction()
        block("mark").performClick()
        assertEquals(listOf(PersonalFixtures.sessionIdOf("mark")), opened)
    }

    @Test
    fun test_F013_design_theStripShowsOneDotPerSessionInItsTypesColourAtMostThree() {
        show { show(AgendaMode.Day) }
        compose.waitUntilTagExists(AgendaTags.WEEK_LINE)

        // 22 September: four sessions that take place (a cancelled one is not counted): three dots, and the count says so.
        val tuesday = tag(AgendaTags.dots(day("2026-09-22"), List(3) { AgendaKind.Private }))
        tuesday.assertExists()
        assertEquals(plural(R.plurals.my_calendar_app_dots, 4, 4), tuesday.names())
        // 23 September: two private sessions and a class, which is the other colour.
        val wednesday = tag(
            AgendaTags.dots(day("2026-09-23"), listOf(AgendaKind.Private, AgendaKind.Private, AgendaKind.Group)),
        )
        assertEquals(plural(R.plurals.my_calendar_app_dots, 3, 3), wednesday.names())
        assertFalse("a day without sessions has none", exists(AgendaTags.dots(day("2026-09-21"), emptyList())))
        noNodeTagged("calendar.dots.2026-09-21")
        dayButton("2026-09-22").assertIsSelected()
        dayButton("2026-09-22").assertHasClickAction().assertHeightIsAtLeast(48.dp).assertWidthIsAtLeast(40.dp)

        // The dots are in the colour of their type: a private session blue, a class purple, from the design tokens.
        val image = wednesday.captureToImage().toPixelMap()
        val dot = 5 * compose.density.density
        val gap = 3 * compose.density.density
        val centre = { index: Int -> (index * (dot + gap) + dot / 2).toInt() }
        val y = image.height / 2
        assertEquals(tokens.sessionPrivateSolid.toArgb(), image[centre(0), y].toArgb())
        assertEquals(tokens.sessionPrivateSolid.toArgb(), image[centre(1), y].toArgb())
        assertEquals(tokens.sessionGroupSolid.toArgb(), image[centre(2), y].toArgb())
    }

    @Test
    fun test_F013_AC15_aWeekRendersFromOneRequest() {
        show()
        compose.waitUntilTagExists(rowTag("anna"))

        assertEquals(
            "the seven days of the week are one request, for this app",
            listOf(Triple("2026-09-21", "2026-09-27", app.fivvi.api.apis.MeApi.SurfaceListMySessions.ANDROID)),
            me.sessionRequests.toList(),
        )
        dayButton("2026-09-23").performClick()
        dayButton("2026-09-24").performClick()
        tag(AgendaTags.MODE_DAY).performClick()
        compose.waitUntilTagExists(AgendaTags.EMPTY)
        dayButton("2026-09-23").performClick()
        compose.waitUntilTagExists(AgendaTags.block(PersonalFixtures.sessionIdOf("early")))
        tag(AgendaTags.MODE_WEEK).performClick()
        compose.waitForIdle()
        assertEquals("no request per day, none for the other view of the same days", 1, me.sessionRequests.size)
    }

    @Test
    fun test_F013_AC6_calendarWeekAndMonthWithDstNote() {
        val thursday = at("08:35", "2026-10-22").toInstant()
        show(PersonalFixtures.octoberWeeks, now = thursday)
        compose.waitUntilTagExists(AgendaTags.CLOCK_NOTE)

        // The week of 19-25 October: dots on the busy days and the note of the day the clocks go back.
        val sunday = if (language == AppLanguage.DUTCH) "zo 25 okt" else "Sun 25 Oct"
        tag(AgendaTags.CLOCK_NOTE).assertTextEquals(string(R.string.my_calendar_app_clock_back, sunday))
        tag(AgendaTags.dots(day("2026-10-20"), listOf(AgendaKind.Group))).assertExists()
        tag(AgendaTags.dots(day("2026-10-22"), listOf(AgendaKind.Private))).assertExists()
        assertFalse("an empty day has none", exists(AgendaTags.dots(day("2026-10-21"), listOf(AgendaKind.Private))))
        merged(AgendaTags.WEEK_LINE).assert(hasText("Week 43 · ", substring = true))

        // The weekly class is at 18:00 on 20 October and on 27 October.
        val spoken = string(R.string.my_day_spoken_time, "19:00", "18:00")
        assertTrue(row("kracht-20").names(), row("kracht-20").names().contains(spoken))
        tag(AgendaTags.NEXT).performClick()
        compose.waitUntilTagExists(rowTag("kracht-27"))
        assertTrue(row("kracht-27").names(), row("kracht-27").names().contains(spoken))
        assertFalse("the next week has no note", exists(AgendaTags.CLOCK_NOTE))

        // The month of October 2026: Monday first, days of other months dimmed.
        tag(AgendaTags.MODE_MONTH).performClick()
        compose.waitUntilTagExists(AgendaTags.MONTH_TITLE)
        dayButton("2026-09-28").assertExists()
        dayButton("2026-11-01").assertExists()
        assertFalse(exists(AgendaTags.day(day("2026-09-27"))))
        assertFalse(exists(AgendaTags.day(day("2026-11-02"))))
        dayButton("2026-10-25").assertExists()
        assertEquals(
            "Monday is the first column of every row",
            dayButton("2026-09-28").getBoundsInRoot().left.value,
            dayButton("2026-10-05").getBoundsInRoot().left.value,
            1f,
        )
        assertTrue(dayButton("2026-09-28").getBoundsInRoot().left < dayButton("2026-09-29").getBoundsInRoot().left)
        compose.waitUntilTagExists(AgendaTags.CLOCK_NOTE)
        tag(AgendaTags.CLOCK_NOTE).assertTextEquals(string(R.string.my_calendar_app_clock_back, sunday))
        merged(
            AgendaTags.PREVIOUS_MONTH,
        ).assertContentDescriptionEquals(string(R.string.my_calendar_app_previous_month))
        merged(AgendaTags.NEXT_MONTH).assertContentDescriptionEquals(string(R.string.my_calendar_app_next_month))
        tag(AgendaTags.MONTH_TITLE).assertTextEquals(
            if (language ==
                AppLanguage.DUTCH
            ) {
                "Oktober 2026"
            } else {
                "October 2026"
            },
        )
    }

    @Test
    fun test_F013_design_weekListsTheSevenDaysAndAnEmptyDaySaysSo() {
        show()
        compose.waitUntilTagExists(rowTag("anna"))

        tag(AgendaTags.emptyDay(day("2026-09-21"))).assertTextEquals(string(R.string.my_calendar_empty_day))
        val name = if (language == AppLanguage.DUTCH) "dinsdag 22 september" else "Tuesday 22 September"
        tag(
            AgendaTags.heading(day("2026-09-22")),
        ).assertTextEquals(string(R.string.my_calendar_app_today_heading, name))
        // A day each: the list is lazy, so each heading is scrolled to.
        listOf("21", "23", "24", "25", "26", "27").forEach {
            compose.onNode(hasScrollAction()).performScrollToNode(hasTestTag(AgendaTags.heading(day("2026-09-$it"))))
            tag(AgendaTags.heading(day("2026-09-$it"))).assertExists()
        }
        compose.onNode(hasScrollAction()).performScrollToNode(hasTestTag(rowTag("mark")))
        row("mark").assertExists()
        row("mark").performClick()
        assertEquals(listOf(PersonalFixtures.sessionIdOf("mark")), opened)
    }

    @Test
    fun test_F013_design_maandShowsTheListOfTheTappedDayUnderTheGrid() {
        show { show(AgendaMode.Month) }
        compose.waitUntilTagExists(AgendaTags.GRID)

        compose.waitUntilTagExists(rowTag("anna"))
        dayButton("2026-09-23").performClick()
        compose.waitUntilTagExists(rowTag("early"))
        dayButton("2026-09-24").performClick()
        compose.waitUntilTagExists(AgendaTags.EMPTY)
        tag(AgendaTags.EMPTY).assertTextEquals(string(R.string.my_calendar_empty_day))
        assertEquals("a month is one request", 1, me.sessionRequests.size)
    }

    @Test
    fun test_F013_design_vandaagJumpsBackToToday() {
        show()
        compose.waitUntilTagExists(AgendaTags.WEEK_LINE)
        tag(AgendaTags.NEXT).performClick()
        compose.waitUntil(5_000) { !exists(AgendaTags.day(day("2026-09-22"))) }

        tag(AgendaTags.TODAY).performClick()

        compose.waitUntilTagExists(AgendaTags.day(day("2026-09-22")))
        dayButton("2026-09-22").assertIsSelected()
    }

    @Test
    fun test_F013_design_aSwipeAcrossTheStripGoesToTheOtherWeek() {
        show()
        compose.waitUntilTagExists(AgendaTags.WEEK_LINE)

        tag(AgendaTags.WEEK_LINE).performTouchInput { swipeLeft() }
        compose.waitUntilTagExists(AgendaTags.day(day("2026-09-29")))
        assertFalse("the next week", exists(AgendaTags.day(day("2026-09-22"))))
        tag(AgendaTags.WEEK_LINE).performTouchInput { swipeRight() }
        compose.waitUntilTagExists(AgendaTags.day(day("2026-09-22")))
        dayButton("2026-09-22").assertExists()
    }

    @Test
    fun test_F013_design_theWeekAndMonthButtonsAreTouchTargetsOf48dp() {
        show()
        compose.waitUntilTagExists(AgendaTags.WEEK_LINE)

        listOf(AgendaTags.PREVIOUS, AgendaTags.NEXT).forEach {
            tag(it).assertWidthIsAtLeast(48.dp).assertHeightIsAtLeast(48.dp)
        }
        merged(AgendaTags.NEXT).assertContentDescriptionEquals(string(R.string.my_calendar_app_next_week))
        merged(AgendaTags.PREVIOUS).assertContentDescriptionEquals(string(R.string.my_calendar_app_previous_week))
        tag(AgendaTags.MODE_MONTH).performClick()
        compose.waitUntilTagExists(AgendaTags.MONTH_TITLE)
        listOf(AgendaTags.PREVIOUS_MONTH, AgendaTags.NEXT_MONTH).forEach {
            tag(it).assertWidthIsAtLeast(48.dp).assertHeightIsAtLeast(48.dp)
        }
    }

    // A block under 48 dp is touched on 48 dp where there is room: the hit area of a short session never covers the block of the
    // next, and a block drawn over another is put beside it, so every block can be seen and touched (the iOS twin does the same, #1556).
    @Test
    fun test_F013_design_theHitAreaOfAShortBlockNeverCoversTheBlockBesideIt() {
        val day = listOf(
            PersonalFixtures.session("a", PersonalFixtures.johns, "11:00", "11:30", client = "Eva Kok"),
            PersonalFixtures.session("b", PersonalFixtures.johns, "11:30", "12:00", client = "Lisa Smit"),
        )
        show(day) { show(AgendaMode.Day) }
        compose.waitUntilTagExists(AgendaTags.TIMELINE)

        val a = block("a").getBoundsInRoot()
        val b = block("b").getBoundsInRoot()
        assertTrue("a's hit area ends where b's begins: $a, $b", a.bottom.value <= b.top.value + 0.5f)
        block("a").assertHeightIsAtLeast(32.dp)
        block("b").performClick()
        assertEquals(listOf(PersonalFixtures.sessionIdOf("b")), opened)
    }

    @Test
    fun test_F013_design_aShortSessionAndTheNextOneThatItsBlockWouldCoverSitSideBySide() {
        val day = listOf(
            PersonalFixtures.session("short", PersonalFixtures.johns, "11:00", "11:15", client = "Eva Kok"),
            PersonalFixtures.session("next", PersonalFixtures.johns, "11:20", "12:20", client = "Lisa Smit"),
        )
        show(day) { show(AgendaMode.Day) }
        compose.waitUntilTagExists(AgendaTags.TIMELINE)

        val short = block("short").getBoundsInRoot()
        val next = block("next").getBoundsInRoot()
        assertTrue("side by side, so neither is hidden: $short, $next", short.right.value <= next.left.value + 0.5f)
        block("short").assertHeightIsAtLeast(48.dp)
        block("short").performClick()
        block("next").performClick()
        assertEquals(listOf(PersonalFixtures.sessionIdOf("short"), PersonalFixtures.sessionIdOf("next")), opened)
    }

    @Test
    fun test_F013_AC7_offlineShowsTheKeptWeekWithItsTime() {
        val store = MemoryPersonalStore()
        me.sessions = PersonalFixtures.septemberWeek
        // The week is read, and kept, while the phone is online.
        compose.runOnUiThread { AgendaViewModel(me, store, { PersonalFixtures.now }, Dispatchers.Unconfined).load() }
        compose.waitUntil(5_000) { PersonalCache(store).sessions.isNotEmpty() }
        me.failSessionsOffline()
        val later = at("08:50").toInstant()
        model = AgendaViewModel(me, store, { later }, Dispatchers.Unconfined)
        compose.setContent {
            DeviceConfigurationOverride(DeviceConfigurationOverride.Locales(LocaleList(language.tag))) {
                FivviTheme { Box(Modifier.size(360.dp, 2600.dp)) { AgendaTab(model, {}, {}, {}) } }
            }
        }

        compose.waitUntilTagExists(AgendaTags.OFFLINE)
        tag(AgendaTags.OFFLINE).assertTextEquals(string(R.string.my_day_app_offline, "08:35"))
        compose.waitUntilTagExists(rowTag("anna"))
        assertFalse(exists(AgendaTags.FAILED))
    }

    @Test
    fun test_F013_AC7_aFailureThatIsNotTheConnectionSaysSoWithOpnieuw() {
        me.failSessionsWith(500)
        show()
        compose.waitUntilTagExists(AgendaTags.FAILED)

        merged(AgendaTags.FAILED).assertTextEquals(string(R.string.my_calendar_app_failed))
        merged(AgendaTags.RETRY).assertTextEquals(string(R.string.my_day_app_retry))
        me.recoverSessions()
        tag(AgendaTags.RETRY).performClick()
        compose.waitUntilTagExists(rowTag("anna"))
        assertFalse(exists(AgendaTags.FAILED))
    }

    @Test
    fun test_F013_AC14_timesAreDutchWithAHintOnAnotherClock() {
        // The device zone of a test is the emulator's, so the screen itself is shown with another zone.
        me.sessions = PersonalFixtures.septemberWeek
        model = AgendaViewModel(me, MemoryPersonalStore(), { PersonalFixtures.now }, Dispatchers.Unconfined)
        model.load()
        compose.setContent {
            DeviceConfigurationOverride(DeviceConfigurationOverride.Locales(LocaleList(language.tag))) {
                FivviTheme {
                    Box(Modifier.size(360.dp, 2600.dp)) {
                        val state by model.state.collectAsState()
                        AgendaScreen(
                            state,
                            AgendaActions({}, {}, {}, {}, {}, {}, {}, {}),
                            deviceZone = java.time.ZoneId.of("America/New_York"),
                            now = PersonalFixtures.now,
                        )
                    }
                }
            }
        }

        compose.waitUntilTagExists(AgendaTags.TIME_ZONE_HINT)
        tag(AgendaTags.TIME_ZONE_HINT).assertTextEquals(string(R.string.personal_time_zone_hint))
    }

    @Test
    fun test_F013_design_openGymIsNotShown() {
        show(PersonalFixtures.septemberWeek + PersonalFixtures.openGym)
        compose.waitUntilTagExists(rowTag("anna"))

        assertFalse(exists(rowTag("gym")))
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages() = appLanguageParameters()
    }
}

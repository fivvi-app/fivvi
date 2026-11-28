package app.fivvi.pro.attendance

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.ComposeTestRule
import androidx.compose.ui.test.onNodeWithTag
import app.fivvi.api.models.AttendanceParticipant
import app.fivvi.api.models.Client
import app.fivvi.api.models.MyDay
import app.fivvi.api.models.PersonalSession
import app.fivvi.api.models.Session
import app.fivvi.api.models.SessionParticipant
import app.fivvi.core.me.workspaceIdOf
import app.fivvi.pro.UI_TIMEOUT_MILLIS
import app.fivvi.pro.attendance.FakeAttendanceServer.Companion.participant
import app.fivvi.pro.classes.classDateOf
import app.fivvi.pro.classes.groupClassOf
import app.fivvi.pro.personal.PersonalFixtures
import app.fivvi.pro.sessions.FakeSessionsApi
import app.fivvi.pro.sessions.sessionOf
import app.fivvi.pro.sessions.trainerOf
import java.time.Instant
import java.time.LocalDateTime
import java.util.UUID

/** Synthetic data of F025 (the spec's): Sarah's session with Anna at 09:00 and "Kracht" at 18:00 with seven participants. */
object AttendanceFixtures {
    const val JOHNS_GYM = "John's Gym"
    const val SARAH_PT = "Sarah Personal Training"
    val account: UUID = UUID.nameUUIDFromBytes("account:sarah".toByteArray())
    val names = listOf("Anna de Vries", "Bram Jansen", "Chris Bakker", "Dana Smit", "Eva Bos", "Fenna Kok", "Gijs Mol")
    val kracht: UUID = PersonalFixtures.sessionIdOf("kracht-evening")
    val annaSession: UUID = PersonalFixtures.sessionIdOf("anna")

    fun at(time: String): Instant = PersonalFixtures.at(time).toInstant()

    /** Anna's 09:00 private session: still *Geboekt* when it has ended ([open]). */
    fun annaItem(open: Boolean = true, cancelled: Boolean = false, annaId: UUID) = PersonalFixtures.session(
        "anna",
        PersonalFixtures.johns,
        "09:00",
        "10:00",
        client = "Anna de Vries",
        place = "John's Gym",
        cancelled = cancelled,
        attendanceOpen = open.takeIf { it },
        clientId = annaId,
    )

    /** The class at 18:00 as Vandaag lists it. */
    fun krachtItem(open: Boolean? = null, cancelled: Boolean = false) = PersonalFixtures.session(
        "kracht-evening",
        PersonalFixtures.johns,
        "18:00",
        "19:00",
        className = "Kracht",
        booked = names.size,
        capacity = 8,
        cancelled = cancelled,
        attendanceOpen = open,
    )

    /** A day with [items] and no *Straks*, so every item is a row. */
    fun day(vararg items: PersonalSession): MyDay = PersonalFixtures.sarah(
        items = items.toList(),
        workspaceCount = 1,
        gap = null,
        places = emptyList(),
    ).copy(next = null)

    /** Anna's private session in the fake API: the session and the attendance route's answer. */
    fun addAnna(sessions: FakeSessionsApi, anna: Client, opensAt: Instant = at("08:30"), cancelled: Boolean = false) {
        sessions.clients[anna.id] = anna
        sessions.sessions[annaSession] = sessionOf(
            id = annaSession,
            client = anna,
            trainer = trainerOf("Sarah"),
            start = LocalDateTime.of(2026, 9, 22, 9, 0),
            status = if (cancelled) Session.Status.CANCELLED else Session.Status.SCHEDULED,
        )
        sessions.attendance.add(
            FakeAttendance(
                annaSession,
                type = app.fivvi.api.models.Attendance.Type.PRIVATE,
                cancelled = cancelled,
                opensAt = FakeAttendanceServer.at(opensAt),
                participants = mutableListOf(
                    AttendanceParticipant(anna.id, anna.name, AttendanceParticipant.Status.BOOKED),
                ),
            ),
        )
    }

    /** "Kracht" on 22 September at 18:00 with seven participants, [statuses] by first name. */
    fun addKracht(
        sessions: FakeSessionsApi,
        opensAt: Instant = at("17:30"),
        cancelled: Boolean = false,
        statuses: Map<String, AttendanceParticipant.Status> = emptyMap(),
    ) {
        val people = names.map {
            participant(
                it,
                statuses[it.substringBefore(' ')] ?: AttendanceParticipant.Status.BOOKED,
            )
        }
        val date = classDateOf(
            kracht,
            groupClassOf("Kracht", nameEn = "Strength"),
            trainer = trainerOf("Sarah"),
            start = LocalDateTime.of(2026, 9, 22, 18, 0),
            capacity = 8,
        )
        sessions.sessions[kracht] = date.copy(
            status = if (cancelled) Session.Status.CANCELLED else Session.Status.SCHEDULED,
            participants = people.map {
                SessionParticipant(it.clientId, it.name, SessionParticipant.AttendanceStatus.valueOf(it.status.name))
            },
        )
        sessions.attendance.add(
            FakeAttendance(
                kracht,
                cancelled = cancelled,
                opensAt = FakeAttendanceServer.at(opensAt),
                participants = people.toMutableList(),
            ),
        )
    }

    fun workspace(name: String) = workspaceIdOf(name)
}

/** The content description of the node with [tag]: what TalkBack reads. */
fun ComposeTestRule.descriptionOf(tag: String): String =
    onNodeWithTag(tag).fetchSemanticsNode().config.getOrNull(SemanticsProperties.ContentDescription)
        ?.joinToString(" ").orEmpty()

fun ComposeTestRule.noNode(tag: String) = onAllNodes(hasTestTag(tag)).fetchSemanticsNodes().isEmpty()

/** Waits until the description of the node with [tag] is [expected]. */
fun ComposeTestRule.waitForDescription(tag: String, expected: String) = waitUntil(UI_TIMEOUT_MILLIS) {
    onAllNodes(hasTestTag(tag)).fetchSemanticsNodes().isNotEmpty() && descriptionOf(tag) == expected
}

/** Waits until [condition] holds: a request leaves the phone, a row changes. */
fun ComposeTestRule.waitFor(condition: () -> Boolean) = waitUntil(UI_TIMEOUT_MILLIS) { condition() }

package app.fivvi.pro.sessions

import app.fivvi.api.infrastructure.Serializer
import app.fivvi.api.models.ValidationError
import app.fivvi.api.models.ValidationErrorIssuesInner
import java.net.HttpURLConnection.HTTP_BAD_REQUEST
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import kotlinx.serialization.decodeFromString
import retrofit2.Response

/** A start the clocks skip, or a date or time that doesn't exist, as the API refused it. */
enum class TimeRefusal { InvalidDate, InvalidTime, TimeDoesNotExist }

/**
 * What PS-04 and PS-05 hold about the time: a start (the wall clock of the workspace, date and time of day), a length, and
 * what the API refused about them. The API refuses what the calendar doesn't have (30 February, a start the clocks skip)
 * and the form words its refusal under the field; nothing here decides a rule.
 */
data class SessionTime(
    val start: LocalDateTime,
    val durationMinutes: Int = 60,
    /** *Andere duur* is chosen, or the length is not one of the buttons. */
    val otherChosen: Boolean = durationMinutes !in CHIPS,
    val refusal: TimeRefusal? = null,
) {
    /** The segmented control's value: the length of a button, or [OTHER] for *Andere duur*. */
    val durationChoice: Int get() = if (otherChosen) OTHER else durationMinutes

    fun withDate(date: LocalDate) = copy(start = start.with(date), refusal = null)

    fun withTime(time: LocalTime) = copy(start = start.with(time), refusal = null)

    fun chooseDuration(choice: Int) =
        if (choice == OTHER) copy(otherChosen = true) else copy(durationMinutes = choice, otherChosen = false)

    fun withOtherDuration(minutes: Int) = copy(durationMinutes = minutes, otherChosen = true)

    fun cleared() = copy(refusal = null)

    /** The end moved to [end] on the day of the start: the length is the time between them (not above zero: the API refuses it). */
    fun withEnd(end: LocalTime) = copy(
        durationMinutes = end.hour * MINUTES_PER_HOUR + end.minute - (start.hour * MINUTES_PER_HOUR + start.minute),
        otherChosen = true,
    )

    /** The `400` of the API: the refusal of the date or the start in [response], or `null` when it is about something else. */
    fun refusedBy(response: Response<*>): SessionTime? {
        if (response.code() != HTTP_BAD_REQUEST) return null
        val issues = runCatching {
            Serializer.kotlinxSerializationJson.decodeFromString<ValidationError>(
                response.errorBody()?.string().orEmpty(),
            )
                .issues
        }.getOrNull() ?: return null
        return refusedBy(issues)
    }

    /**
     * The refusal of the date or the start among the [issues] of a `400`, or `null` when they are about something else. A
     * class form's quick create nests the date (`firstDate.localDate`), so the end of the path decides.
     */
    fun refusedBy(issues: List<ValidationErrorIssuesInner>): SessionTime? {
        var refusal: TimeRefusal? = null
        for (issue in issues) {
            if (issue.path.endsWith("localDate")) {
                refusal = TimeRefusal.InvalidDate
            } else if (issue.path.endsWith("localStart")) {
                refusal =
                    if (issue.code == "time_does_not_exist") TimeRefusal.TimeDoesNotExist else TimeRefusal.InvalidTime
            }
        }
        return refusal?.let { copy(refusal = it) }
    }

    companion object {
        /** The lengths of the buttons; any other is chosen from the list ([OTHER_DURATIONS]). */
        val CHIPS = listOf(45, 60, 90)

        /** The lengths the API accepts: 15 to 240 minutes in steps of 5 (`durationMinutes` in the contract). */
        val OTHER_DURATIONS = (15..240 step 5).toList()

        /** The segmented control's value for *Andere duur*. */
        const val OTHER = 0

        private const val MINUTES_PER_HOUR = 60
    }
}

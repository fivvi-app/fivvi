package app.fivvi.pro.personal

import app.fivvi.pro.sessions.SessionFormat
import java.util.Locale

/** The two formattings the unit tests of the personal screens write dates and times in (nl-NL, and English as en-GB). */
object TestFormat {
    val dutch = SessionFormat(Locale.forLanguageTag("nl-NL"), PersonalRows.TIME_ZONE)
    val english = SessionFormat(Locale.forLanguageTag("en-GB"), PersonalRows.TIME_ZONE)
}

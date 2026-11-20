package app.fivvi.pro.sessions

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import app.fivvi.api.infrastructure.Serializer
import app.fivvi.api.models.TrainerConflict
import app.fivvi.api.models.TrainerConflictItem
import app.fivvi.core.R
import app.fivvi.core.ui.testTagsAsIds
import java.time.ZoneId
import kotlinx.serialization.decodeFromString

/**
 * PS-07 *Dubbele boeking* (F023 AC6, Android): what the native alert says when the API refused a save with `409`
 * `trainer_conflict`, a soft warning about the trainer's other sessions of this workspace. The API finds the overlaps (the
 * app has no rule of its own, AC7); this words them: "{trainer} heeft dan al iets", or "Je hebt dan al iets" when the
 * person plans for themself, then one line per session, *Terug* · *Toch opslaan*. *Toch opslaan* sends the same request
 * again with `allowConflicts`.
 */
data class DoubleBooking(
    val conflicts: List<TrainerConflictItem>,
    /** The trainer's name; `null` when the person plans for themself. */
    val trainerName: String?,
) {
    /** A class has a Dutch and maybe an English name: the viewer's language, else Dutch (`pickContentLanguage`). */
    fun nameOf(item: TrainerConflictItem, english: Boolean): String =
        item.displayNameEn?.takeIf { english && it.isNotEmpty() } ?: item.displayName

    @StringRes
    fun typeOf(item: TrainerConflictItem): Int = when (item.type) {
        TrainerConflictItem.Type.PRIVATE -> R.string.sessions_double_booking_type_private
        TrainerConflictItem.Type.GROUP -> R.string.sessions_double_booking_type_group
        TrainerConflictItem.Type.OPEN_GYM -> R.string.sessions_double_booking_type_open_gym
    }

    companion object {
        /** The warning for these sessions; `null` when the API listed none, so there is nothing to word. */
        fun of(conflicts: List<TrainerConflictItem>?, trainerName: String?): DoubleBooking? =
            conflicts?.takeIf { it.isNotEmpty() }?.let { DoubleBooking(it, trainerName) }

        /** The sessions of a `409` body that says `trainer_conflict`; `null` for any other body. */
        fun conflictsOf(body: String?): List<TrainerConflictItem>? = runCatching {
            Serializer.kotlinxSerializationJson.decodeFromString<TrainerConflict>(body.orEmpty())
        }.getOrNull()?.takeIf { it.code == TrainerConflict.Code.TRAINER_CONFLICT }?.conflicts
    }
}

/** Test tags of the alert, shared with the iOS accessibility identifiers: `<prefix>.doubleBooking.back` and `.saveAnyway`. */
object DoubleBookingTags {
    fun back(prefix: String) = "$prefix.doubleBooking.back"

    fun saveAnyway(prefix: String) = "$prefix.doubleBooking.saveAnyway"
}

/** The `AlertDialog` of PS-07 over PS-04 or PS-05 ([idPrefix] is `newSession` or `reschedule`). */
@Composable
fun DoubleBookingDialog(
    booking: DoubleBooking,
    zone: ZoneId,
    idPrefix: String,
    onBack: () -> Unit,
    onSaveAnyway: () -> Unit,
) {
    val format = rememberSessionFormat(zone)
    val english = LocalConfiguration.current.locales[0].language != "nl"
    AlertDialog(
        onDismissRequest = onBack,
        modifier = Modifier.testTagsAsIds(),
        confirmButton = {
            TextButton(onClick = onSaveAnyway, modifier = Modifier.testTag(DoubleBookingTags.saveAnyway(idPrefix))) {
                Text(stringResource(R.string.sessions_double_booking_save_anyway))
            }
        },
        dismissButton = {
            TextButton(onClick = onBack, modifier = Modifier.testTag(DoubleBookingTags.back(idPrefix))) {
                Text(stringResource(R.string.sessions_double_booking_back))
            }
        },
        title = {
            Text(
                booking.trainerName?.let { stringResource(R.string.sessions_double_booking_title, it) }
                    ?: stringResource(R.string.sessions_double_booking_title_own),
            )
        },
        text = {
            // *do 24 sep, 09:00–10:00: Mark Jansen (privésessie)*, one line per session, as the API listed them.
            Column {
                booking.conflicts.forEach { item ->
                    Text(
                        stringResource(
                            R.string.sessions_double_booking_item,
                            format.day(item.startsAt),
                            format.time(item.endsAt),
                            booking.nameOf(item, english),
                            format.time(item.startsAt),
                            stringResource(booking.typeOf(item)),
                        ),
                    )
                }
            }
        },
    )
}

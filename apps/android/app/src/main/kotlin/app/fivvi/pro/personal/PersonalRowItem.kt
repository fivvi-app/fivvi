package app.fivvi.pro.personal

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.testTag as semanticsTestTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.fivvi.core.R
import app.fivvi.core.kit.AvatarSize
import app.fivvi.core.kit.ListRowMinHeight
import app.fivvi.core.kit.PillTone
import app.fivvi.core.kit.SessionAvatar
import app.fivvi.core.kit.SessionType
import app.fivvi.core.kit.StatusPill
import app.fivvi.core.kit.classLevelAccessibleName
import app.fivvi.core.kit.initialsOf
import app.fivvi.core.kit.levelRowInlineContent
import app.fivvi.core.kit.levelRowText
import app.fivvi.core.theme.numeric
import app.fivvi.core.theme.tokens
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.footnote
import app.fivvi.designtokens.headline
import app.fivvi.designtokens.subhead
import app.fivvi.designtokens.workspaceColor

/** How much of its colour a row of the past, or a cancelled one, keeps. */
private const val DIMMED = 0.55f

/** The dot beside a workspace's name (`Tokens.workspaceColor(for:)` of iOS): the colour comes from the workspace's ID. */
private val DotSize: Dp = 8.dp

/** The word for the kind of a row: *Privésessie* or *Groepsles*. */
@Composable
fun kindLabel(row: PersonalRow): String =
    stringResource(if (row.isGroup) R.string.my_day_type_group else R.string.my_day_type_private)

/**
 * *Je valt in voor Sarah* on the substitute's row, *Overgenomen door Mike* on the replaced trainer's (F024), or `null` for a
 * date without a substitution: the API sends the names, the words are the catalog's.
 */
@Composable
internal fun substitutionText(row: PersonalRow): String? = when (val substitution = row.substitution) {
    is PersonalSubstitution.CoveringFor -> stringResource(R.string.my_day_covering_for, substitution.name)
    is PersonalSubstitution.TakenOverBy -> stringResource(R.string.my_day_taken_over_by, substitution.name)
    null -> null
}

/**
 * "09:00 tot 10:00, Anna de Vries, privésessie, John's Gym, Sarah Personal Training, Geannuleerd": the one name a row has for
 * TalkBack. It always names the type, whether or not the row writes it. A class with a level in the list names it right after
 * the class name, "Reformer Power, Niveau: Gevorderd" (F067): the bars after the name are not read on their own.
 */
@Composable
internal fun spokenLabel(row: PersonalRow, trainer: String? = null): String {
    val join = stringResource(R.string.my_day_spoken_join)
    val parts = listOfNotNull(
        stringResource(R.string.my_day_spoken_time, row.endText, row.startText),
        row.title,
        row.level?.let { classLevelAccessibleName(it) },
        kindLabel(row).lowercase(),
        row.location,
        trainer,
        row.workspaceName.takeIf { row.showsWorkspace },
        substitutionText(row),
        stringResource(R.string.my_day_cancelled).takeIf { row.isCancelled },
    )
    return parts.reduce { all, next -> join.format(all, next) }
}

/** *Jij*, the trainer's name or [nobody] (*Geen trainer*): who trains a row of *Hele studio*, or `null` on Mijn dag. */
@Composable
private fun trainerText(row: PersonalRow, nobody: String?): String? = when (val trainer = row.trainer) {
    null -> null
    PersonalTrainer.You -> stringResource(R.string.my_day_app_studio_you)
    is PersonalTrainer.Named -> trainer.name
    PersonalTrainer.Nobody -> nobody
}

/**
 * A row of Vandaag and Agenda, Calendar-style on Android (`DECISIONS.md` §3): the shaped avatar of the session type, the
 * name, what only fits when there is more than one kind or team, the time on the right and, for a class, the pill. It is
 * one element for TalkBack, named with the type; the arrow to the maps app is an action of it, and a button for everyone else.
 * On *Hele studio* a row also says who trains it; [nobody] is the word for a session with no trainer (*Geen trainer*),
 * and is left out (`null`) on Mijn dag, where a row has no trainer line, so no row can show a blank one. The tags are
 * `<tagPrefix>.row.<id>` and `<tagPrefix>.route.<id>`: `today` on Vandaag, `calendar` on Agenda, as on iOS.
 */
@Composable
fun PersonalRowItem(
    row: PersonalRow,
    onOpen: () -> Unit,
    onRoute: (String) -> Unit,
    modifier: Modifier = Modifier,
    nobody: String? = null,
    tagPrefix: String = TodayTags.PREFIX,
) {
    val trainer = trainerText(row, nobody)
    val spoken = spokenLabel(row, trainer)
    val routeLabel = stringResource(R.string.my_day_app_open_route)
    val route = row.routeUrl
    Row(
        modifier.fillMaxWidth().defaultMinSize(minHeight = ListRowMinHeight),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            modifier = Modifier
                .weight(1f)
                .clickable(onClick = onOpen)
                .alpha(if (row.isPast || row.isCancelled || row.isTakenOver) DIMMED else 1f)
                .padding(start = Spacing.space4, top = Spacing.space3, bottom = Spacing.space3, end = Spacing.space2)
                .clearAndSetSemantics {
                    semanticsTestTag = "$tagPrefix.row.${row.id}"
                    contentDescription = spoken
                    role = Role.Button
                    if (route !=
                        null
                    ) {
                        customActions = listOf(
                            CustomAccessibilityAction(routeLabel) {
                                onRoute(route)
                                true
                            },
                        )
                    }
                },
            horizontalArrangement = Arrangement.spacedBy(Spacing.space3 + Spacing.space0_5),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            SessionAvatar(if (row.isGroup) SessionType.Group else SessionType.Private, initialsOf(row.title))
            Details(row, trainer, tagPrefix, Modifier.weight(1f))
            Times(row)
        }
        if (route != null) {
            // The arrow is a target for a finger; TalkBack has it as the row's action instead.
            IconButton(
                onClick = { onRoute(route) },
                modifier = Modifier.testTag("$tagPrefix.route.${row.id}").clearAndSetSemantics { },
            ) {
                Icon(painterResource(R.drawable.ic_arrow_up_right), contentDescription = null)
            }
        }
    }
}

@Composable
private fun Details(row: PersonalRow, trainer: String?, tagPrefix: String, modifier: Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(Spacing.space0_5)) {
        RowTitle(row, tagPrefix)
        if (row.namesKind) Secondary(kindLabel(row))
        row.location?.let { Secondary(it) }
        trainer?.let { Secondary(it) }
        if (row.showsWorkspace) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(Spacing.space1),
            ) {
                Box(
                    Modifier.size(
                        DotSize,
                    ).background(MaterialTheme.tokens.workspaceColor(row.workspaceId.toString()), CircleShape),
                )
                Secondary(row.workspaceName)
            }
        }
        // F024: a plain secondary line, as the prototype's *Groepsles (invallen)* shows; a taken-over row is dimmed as a whole.
        substitutionText(row)?.let { Secondary(it) }
        if (row.isCancelled) Secondary(stringResource(R.string.my_day_cancelled))
    }
}

/**
 * The class name, with the compact level bars right after it (F067): the bars are part of the text, so a long name wraps and
 * the bars stay beside its last word, and nothing is cut off. A private session, *Alle niveaus* and *Geen* have the name alone.
 * The tags are `<tagPrefix>.title.<id>` and, for the bars, `<tagPrefix>.level.<id>`.
 */
@Composable
private fun RowTitle(row: PersonalRow, tagPrefix: String) {
    val level = row.level
    Text(
        text = levelRowText(row.title, level, level?.let { classLevelAccessibleName(it) }.orEmpty()),
        modifier = Modifier.testTag("$tagPrefix.title.${row.id}"),
        inlineContent = levelRowInlineContent(level, "$tagPrefix.level.${row.id}"),
        style = MaterialTheme.typography.headline,
        textDecoration = if (row.isCancelled) TextDecoration.LineThrough else null,
    )
}

@Composable
private fun Times(row: PersonalRow) {
    Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(Spacing.space1)) {
        Text(
            row.startText,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.subhead.numeric().copy(fontWeight = FontWeight.SemiBold),
            textAlign = TextAlign.End,
        )
        Text(
            row.endText,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.footnote.numeric(),
            textAlign = TextAlign.End,
        )
        when (val pill = row.pill) {
            null -> Unit

            PersonalPill.Full -> StatusPill(stringResource(R.string.my_day_app_full), PillTone.Warning)

            is PersonalPill.Booked ->
                StatusPill(
                    stringResource(R.string.my_calendar_block_booked, pill.booked.toString(), pill.capacity.toString()),
                    PillTone.Neutral,
                )
        }
    }
}

@Composable
private fun Secondary(text: String) {
    Text(text, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.subhead)
}

package app.fivvi.core.kit

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
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.MaterialShapes
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.toShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.fivvi.core.theme.numeric
import app.fivvi.core.theme.tokens
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.headline
import app.fivvi.designtokens.subhead

/** The size of a session avatar (the prototype's Android list: 44). */
val AvatarSize: Dp = 44.dp

/** The row height of a list row on Android: 64 dp at least (the prototype's Android list). */
val ListRowMinHeight: Dp = 64.dp

@OptIn(ExperimentalMaterial3ExpressiveApi::class)
@Composable
private fun AvatarShape.toComposeShape(): Shape = when (this) {
    AvatarShape.Cookie -> MaterialShapes.Cookie9Sided.toShape()
    AvatarShape.Clover -> MaterialShapes.Clover4Leaf.toShape()
}

/**
 * The shaped avatar of a session (DECISIONS.md section 3, AC10): a cookie for a private session, a clover for a group
 * class, on the tint of the type with its [letters] (a client's initials, a class's first letter) in the type's text colour.
 * The letters are decorative; the row names the session.
 */
@Composable
fun SessionAvatar(type: SessionType, letters: String, modifier: Modifier = Modifier) {
    val colors = MaterialTheme.tokens.sessionColors(type)
    val shape = type.avatarShape.toComposeShape()
    Box(
        modifier = modifier.size(AvatarSize).background(colors.tint, shape).clearAndSetSemantics { },
        contentAlignment = Alignment.Center,
    ) {
        Text(letters, color = colors.text, style = MaterialTheme.typography.subhead, fontWeight = FontWeight.Bold)
    }
}

/**
 * A row of an [InsetGroupedList] (AC14): [leading] (an avatar, usually), a title with a subtitle under it, and [trailing]
 * text on the right, like the time of a session. [onClick] makes the whole row one touch target.
 */
@Composable
fun ListRow(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    leading: (@Composable () -> Unit)? = null,
    trailing: String? = null,
    onClick: (() -> Unit)? = null,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = ListRowMinHeight)
            .let { if (onClick != null) it.clickable(onClick = onClick) else it }
            .padding(horizontal = Spacing.space4, vertical = Spacing.space3),
        horizontalArrangement = Arrangement.spacedBy(Spacing.space3 + Spacing.space0_5),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        leading?.invoke()
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.headline)
            if (subtitle != null) {
                Text(
                    subtitle,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.subhead,
                )
            }
        }
        if (trailing != null) {
            Text(
                trailing,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                // The prototype's Android time: 14, semibold, tabular and rounded.
                style = MaterialTheme.typography.subhead.numeric().copy(fontWeight = FontWeight.SemiBold),
                textAlign = TextAlign.End,
            )
        }
    }
}

/** A session in the day's list (AC10): its shaped avatar, title, subtitle and time on the right. */
@Composable
fun SessionRow(
    type: SessionType,
    letters: String,
    title: String,
    time: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    onClick: (() -> Unit)? = null,
) {
    ListRow(
        title = title,
        modifier = modifier,
        subtitle = subtitle,
        leading = { SessionAvatar(type, letters) },
        trailing = time,
        onClick = onClick,
    )
}

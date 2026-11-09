package app.fivvi.core.kit

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.fivvi.designtokens.Radius
import app.fivvi.designtokens.Spacing

/** The radius of a card: 28 dp on Android (26 on iOS and the web), `radius.card` in the tokens. */
val CardRadius: Dp = Radius.card

/** The outer corners of a grouped list, and the corners between two of its rows (the prototype's Android list). */
val GroupOuterRadius: Dp = 20.dp
val GroupInnerRadius: Dp = Radius.xs

/** The gap between two rows of a grouped list. */
val GroupGap: Dp = Spacing.space0_5

/**
 * A card (AC14): the white card of the light canvas and the `#1C1C1E` one of the dark, with the card radius. The padding
 * is [Spacing.space4]; a card that holds a list sets [contentPadding] to zero.
 */
@Composable
fun FivviCard(modifier: Modifier = Modifier, contentPadding: Dp = Spacing.space4, content: @Composable () -> Unit) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(CardRadius),
        color = MaterialTheme.colorScheme.surfaceContainerLow,
        contentColor = MaterialTheme.colorScheme.onSurface,
    ) {
        Column(Modifier.padding(contentPadding)) { content() }
    }
}

/** The top and bottom corner radii of one row of a grouped list. */
@Immutable
data class RowCorners(val top: Dp, val bottom: Dp) {
    val shape get() = RoundedCornerShape(topStart = top, topEnd = top, bottomEnd = bottom, bottomStart = bottom)
}

/** The first row of a group has the outer radius on top, the last at the bottom, and a lone row on both. */
fun groupRowCorners(index: Int, count: Int) = RowCorners(
    top = if (index == 0) GroupOuterRadius else GroupInnerRadius,
    bottom = if (index == count - 1) GroupOuterRadius else GroupInnerRadius,
)

/** The rows of an [InsetGroupedList]. */
interface InsetGroupedListScope {
    /** One row, drawn on the card colour with the corners of its place in the group. */
    fun row(content: @Composable () -> Unit)
}

/**
 * The inset grouped list (AC14), Android's version: the rows are separate cards 2 dp apart, the first and last with
 * the outer corners, so the group reads as one rounded block on the canvas. Put [ListRow]s in it, or any content.
 */
@Composable
fun InsetGroupedList(modifier: Modifier = Modifier, rows: InsetGroupedListScope.() -> Unit) {
    val collected = buildList<@Composable () -> Unit> {
        object : InsetGroupedListScope {
            override fun row(content: @Composable () -> Unit) {
                add(content)
            }
        }.rows()
    }
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(GroupGap)) {
        collected.forEachIndexed { index, content ->
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = groupRowCorners(index, collected.size).shape,
                color = MaterialTheme.colorScheme.surfaceContainerLowest,
                contentColor = MaterialTheme.colorScheme.onSurface,
            ) { content() }
        }
    }
}

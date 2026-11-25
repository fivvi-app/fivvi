package app.fivvi.core.kit

import androidx.annotation.StringRes
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.InlineTextContent
import androidx.compose.foundation.text.appendInlineContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.Placeholder
import androidx.compose.ui.text.PlaceholderVerticalAlign
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.fivvi.api.models.ClassLevel
import app.fivvi.core.R
import app.fivvi.core.theme.tokens
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.TokenColors
import app.fivvi.designtokens.subhead

/**
 * The forms of the level icon (F067): [Compact] is the bars only, for the rows of a list, and draws nothing for *Alle
 * niveaus*; [Full] is the bars with the word, for a page about one class; [Bars] is the bars only for every level, where
 * the word is already next to them (the eyebrow of TD-03). A class with no level (*Geen*) is not drawn: callers pass `null`.
 */
enum class LevelIconForm { Compact, Full, Bars }

/** How many of the three bars are filled: 1 *Beginner*, 2 *Gemiddeld*, 3 *Gevorderd*; *Alle niveaus* all three, at one weight. */
val ClassLevel.filledBars: Int
    get() = when (this) {
        ClassLevel.BEGINNER -> 1
        ClassLevel.INTERMEDIATE -> 2
        ClassLevel.ADVANCED, ClassLevel.ALL_LEVELS -> 3
    }

/** A list (a row) shows the icon for the three levels with a rank; *Alle niveaus* shows none there. */
val ClassLevel.showsInList: Boolean get() = this != ClassLevel.ALL_LEVELS

/** Whether the icon draws anything in [form]: a compact one not for *Alle niveaus*. */
fun levelIconShown(level: ClassLevel, form: LevelIconForm): Boolean = form != LevelIconForm.Compact || level.showsInList

/** The levels in the order of the field of TD-05: *Alle niveaus*, *Beginner*, *Gemiddeld*, *Gevorderd* (*Geen* comes first, as `null`). */
val classLevelFieldOrder: List<ClassLevel> =
    listOf(ClassLevel.ALL_LEVELS, ClassLevel.BEGINNER, ClassLevel.INTERMEDIATE, ClassLevel.ADVANCED)

/** One bar of the icon, in the unit of the box it is drawn in. */
data class LevelBar(val left: Float, val top: Float, val width: Float, val height: Float)

/** The geometry of the bars, in dp: 3 wide, 2 apart, 5, 8 and 11 high, the unfilled ones faded. */
object LevelBarsMetrics {
    val heights = listOf(5f, 8f, 11f)
    const val BAR_WIDTH = 3f
    const val BAR_GAP = 2f
    const val BAR_RADIUS = 1f
    const val UNFILLED_ALPHA = 0.3f

    val totalWidth: Float = heights.size * BAR_WIDTH + (heights.size - 1) * BAR_GAP
    val totalHeight: Float = heights.max()

    /** The bars scaled to fit a box of [boxWidth] x [boxHeight], at its start and standing on its bottom edge. */
    fun layout(boxWidth: Float, boxHeight: Float): List<LevelBar> {
        val unit = minOf(boxWidth / totalWidth, boxHeight / totalHeight)
        return heights.mapIndexed { index, barHeight ->
            LevelBar(
                left = index * (BAR_WIDTH + BAR_GAP) * unit,
                top = boxHeight - barHeight * unit,
                width = BAR_WIDTH * unit,
                height = barHeight * unit,
            )
        }
    }
}

/** The colour of the filled bars: the tokens' secondary text colour, a declared contrast pair (`native-secondary-text`). */
fun TokenColors.levelBarsColor(): Color = textSecondary

/** The word of a level in the viewer's language; *Geen* / *None* for a class with none. */
@get:StringRes
val ClassLevel?.wordRes: Int
    get() = when (this) {
        null -> R.string.class_level_none
        ClassLevel.ALL_LEVELS -> R.string.class_level_all_levels
        ClassLevel.BEGINNER -> R.string.class_level_beginner
        ClassLevel.INTERMEDIATE -> R.string.class_level_intermediate
        ClassLevel.ADVANCED -> R.string.class_level_advanced
    }

/** *Gevorderd* / *Advanced*. */
@Composable
fun classLevelWord(level: ClassLevel?): String = stringResource(level.wordRes)

/** The icon's accessible name, *Niveau: Gevorderd* / *Level: Advanced*: the level is never in colour alone. */
@Composable
fun classLevelAccessibleName(level: ClassLevel): String =
    stringResource(R.string.class_level_accessible_name, classLevelWord(level))

/**
 * The level of a class as three bars of rising height (F067), filled by level, in the tokens' secondary text colour, with
 * *Niveau: {level}* as its TalkBack label (the word beside the bars of [LevelIconForm.Full] is part of that one element). Draws
 * nothing for a form that shows none of [level] (compact, *Alle niveaus*).
 */
@Composable
fun LevelIcon(level: ClassLevel, form: LevelIconForm, modifier: Modifier = Modifier) {
    if (!levelIconShown(level, form)) return
    val name = classLevelAccessibleName(level)
    Row(
        modifier = modifier.semantics {
            contentDescription = name
            role = Role.Image
        },
        horizontalArrangement = Arrangement.spacedBy(Spacing.space2),
        verticalAlignment = Alignment.Bottom,
    ) {
        LevelBars(level.filledBars, Modifier.size(LevelBarsMetrics.totalWidth.dp, LevelBarsMetrics.totalHeight.dp))
        if (form == LevelIconForm.Full) {
            Text(
                text = classLevelWord(level),
                modifier = Modifier.clearAndSetSemantics { },
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.subhead,
            )
        }
    }
}

/** The bars, [filled] of the three drawn in full and the rest faded; they scale to the size they are given. */
@Composable
fun LevelBars(filled: Int, modifier: Modifier = Modifier) {
    val color = MaterialTheme.tokens.levelBarsColor()
    Canvas(modifier) {
        LevelBarsMetrics.layout(size.width, size.height).forEachIndexed { index, bar ->
            val unit = bar.width / LevelBarsMetrics.BAR_WIDTH
            drawRoundRect(
                color = color,
                topLeft = Offset(bar.left, bar.top),
                size = Size(bar.width, bar.height),
                cornerRadius = CornerRadius(LevelBarsMetrics.BAR_RADIUS * unit),
                alpha = if (index < filled) 1f else LevelBarsMetrics.UNFILLED_ALPHA,
            )
        }
    }
}

/** A non-breaking space: the bars never start a line of their own, they stay with the last word of the name. */
private const val NO_BREAK = " "

private const val LEVEL_BARS_ID = "level.bars"

/**
 * A class name with the compact icon right after it, for a row (F067): the bars are part of the text, so a long name wraps and
 * the bars stay beside its last word, and nothing is cut off. The name alone where a row shows no icon (*Alle niveaus*,
 * *Geen*). Pass [levelRowInlineContent] to the same [Text]. The bars are decoration for the text: the row's own label names
 * the level for TalkBack, so [accessibleName] only fills the text's alternative.
 */
fun levelRowText(name: String, level: ClassLevel?, accessibleName: String): AnnotatedString = buildAnnotatedString {
    append(name)
    if (level != null && levelIconShown(level, LevelIconForm.Compact)) {
        append(NO_BREAK)
        appendInlineContent(LEVEL_BARS_ID, accessibleName)
    }
}

/**
 * The bars of [levelRowText], sized in `sp` so they grow with the text size, standing on the baseline. [tag] names them for a
 * test (`<prefix>.level.<id>`); a row's own semantics hide them from TalkBack.
 */
fun levelRowInlineContent(level: ClassLevel?, tag: String): Map<String, InlineTextContent> {
    if (level == null || !levelIconShown(level, LevelIconForm.Compact)) return emptyMap()
    val placeholder = Placeholder(
        width = LevelBarsMetrics.totalWidth.sp,
        height = LevelBarsMetrics.totalHeight.sp,
        placeholderVerticalAlign = PlaceholderVerticalAlign.AboveBaseline,
    )
    return mapOf(
        LEVEL_BARS_ID to
            InlineTextContent(placeholder) { LevelBars(level.filledBars, Modifier.fillMaxSize().testTag(tag)) },
    )
}

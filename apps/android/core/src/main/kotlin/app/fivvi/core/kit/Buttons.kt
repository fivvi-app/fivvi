package app.fivvi.core.kit

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.fivvi.core.theme.tokens
import app.fivvi.designtokens.label

/** The height of a pill button and of a round control: 48 dp, also when buttons are stacked (DECISIONS.md section 2). */
val PillButtonHeight: Dp = 48.dp

/** The space between stacked pill buttons: 10 dp. */
val PillButtonGap: Dp = 10.dp

enum class PillButtonStyle { Primary, Tonal, Text, Danger }

/**
 * The pill button (AC14): a Material 3 button with fully rounded ends, at least 48 dp high. [Primary][PillButtonStyle.Primary]
 * is the accent fill, [Tonal][PillButtonStyle.Tonal] the quiet one, [Text][PillButtonStyle.Text] has no fill and
 * [Danger][PillButtonStyle.Danger] is for destructive actions. It keeps its height at the largest font scale by growing.
 */
@Composable
fun PillButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    style: PillButtonStyle = PillButtonStyle.Primary,
    enabled: Boolean = true,
) {
    val sized = modifier.heightIn(min = PillButtonHeight).let { if (LocalStacked.current) it.fillMaxWidth() else it }
    val label: @Composable () -> Unit = {
        Text(text, style = MaterialTheme.typography.label, textAlign = TextAlign.Center)
    }
    when (style) {
        PillButtonStyle.Primary -> Button(onClick, sized, enabled, shape = CircleShape, content = { label() })

        PillButtonStyle.Tonal -> FilledTonalButton(onClick, sized, enabled, shape = CircleShape, content = { label() })

        PillButtonStyle.Text -> TextButton(
            onClick,
            sized,
            enabled,
            shape = CircleShape,
            // The label is text in the accent: accentText, which reaches 4.5:1 on the canvas; the fill does not (4.11:1).
            colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.tokens.accentText),
            content = { label() },
        )

        PillButtonStyle.Danger -> Button(
            onClick,
            sized,
            enabled,
            shape = CircleShape,
            colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.tokens.actionDangerBg,
                contentColor = MaterialTheme.tokens.actionDangerFg,
            ),
            content = { label() },
        )
    }
}

private val LocalStacked = compositionLocalOf { false }

/** Pill buttons stacked at full width, each keeping its full height, 10 dp apart. */
@Composable
fun PillButtonStack(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    CompositionLocalProvider(LocalStacked provides true) {
        Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(PillButtonGap), content = content)
    }
}

enum class RoundControlStyle { Primary, Tonal }

/**
 * The round control (AC14): a 48 dp circle with an icon, like the + of *Klanten*. Round controls stay round
 * (DECISIONS.md section 2). [contentDescription] says what it does, for a screen reader.
 */
@Composable
fun RoundControl(
    icon: Painter,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    style: RoundControlStyle = RoundControlStyle.Primary,
) {
    val sized = modifier.size(PillButtonHeight)
    val glyph: @Composable () -> Unit = { Icon(icon, contentDescription) }
    when (style) {
        RoundControlStyle.Primary -> FilledIconButton(onClick, sized, shape = CircleShape, content = { glyph() })
        RoundControlStyle.Tonal -> FilledTonalIconButton(onClick, sized, shape = CircleShape, content = { glyph() })
    }
}

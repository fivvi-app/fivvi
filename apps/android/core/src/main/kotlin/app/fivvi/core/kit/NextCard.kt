package app.fivvi.core.kit

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.fivvi.core.theme.tokens
import app.fivvi.designtokens.Spacing
import app.fivvi.designtokens.caption
import app.fivvi.designtokens.label
import app.fivvi.designtokens.subhead
import app.fivvi.designtokens.title2

/**
 * The gradient "next" card (AC14): the next session in its type's colour, darker at the bottom (the tokens' 85% and 75%
 * mixes with black, so it stays in one hue), with white text. [actions] sit in a row at the bottom, usually pill buttons
 * or round controls.
 */
@Composable
fun NextCard(
    type: SessionType,
    caption: String,
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    actions: (@Composable RowScope.() -> Unit)? = null,
) {
    val colors = MaterialTheme.tokens.sessionColors(type)
    CompositionLocalProvider(LocalContentColor provides colors.onGradient) {
        Column(
            modifier = modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(CardRadius))
                .background(Brush.verticalGradient(listOf(colors.gradientTop, colors.gradientBottom)))
                .padding(Spacing.space5),
            verticalArrangement = Arrangement.spacedBy(Spacing.space1),
        ) {
            Text(caption, style = MaterialTheme.typography.caption)
            Text(title, modifier = Modifier.semantics { heading() }, style = MaterialTheme.typography.title2)
            if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.subhead)
            if (actions != null) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(top = Spacing.space3),
                    horizontalArrangement = Arrangement.spacedBy(PillButtonGap),
                    content = actions,
                )
            }
        }
    }
}

/**
 * A button for the [actions][NextCard] row: an outlined pill in the card's text colour, so it reads on the gradient the
 * same way the card's text does. Use it only inside a [NextCard].
 */
@Composable
fun NextCardButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val onGradient = LocalContentColor.current
    OutlinedButton(
        onClick = onClick,
        modifier = modifier.heightIn(min = PillButtonHeight),
        shape = CircleShape,
        colors = ButtonDefaults.outlinedButtonColors(contentColor = onGradient),
        border = BorderStroke(NextCardButtonBorder, onGradient),
    ) {
        Text(text, style = MaterialTheme.typography.label, textAlign = TextAlign.Center)
    }
}

private val NextCardButtonBorder = 1.5.dp

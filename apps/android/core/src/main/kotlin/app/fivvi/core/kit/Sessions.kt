package app.fivvi.core.kit

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color
import app.fivvi.designtokens.TokenColors

/**
 * The kinds of session a row, avatar or card can stand for. Open Gym is left out on purpose: its colours exist in the
 * tokens, but no screen or kit component uses them yet (spec #590 AC6).
 */
enum class SessionType { Private, Group }

/** The shape a session type's avatar has (DECISIONS.md section 3: a shaped avatar per type on Android). */
enum class AvatarShape { Cookie, Clover }

val SessionType.avatarShape: AvatarShape
    get() = when (this) {
        SessionType.Private -> AvatarShape.Cookie
        SessionType.Group -> AvatarShape.Clover
    }

/** The colours of one session type in the mode shown, all from its own tokens. */
@Immutable
class SessionColors(
    val solid: Color,
    /** The tint: the fill of an avatar or a pill. */
    val tint: Color,
    /** Text and letters in the type's colour on the tint, on cards and on the canvas. */
    val text: Color,
    /** Text and glyphs on the gradient. */
    val onGradient: Color,
    val gradientTop: Color,
    val gradientBottom: Color,
)

fun TokenColors.sessionColors(type: SessionType): SessionColors = when (type) {
    SessionType.Private -> SessionColors(
        solid = sessionPrivateSolid,
        tint = sessionPrivateBg,
        text = sessionPrivateText,
        onGradient = sessionPrivateOnSolid,
        gradientTop = sessionPrivateGradientTop,
        gradientBottom = sessionPrivateGradientBottom,
    )

    SessionType.Group -> SessionColors(
        solid = sessionGroupSolid,
        tint = sessionGroupBg,
        text = sessionGroupText,
        onGradient = sessionGroupOnSolid,
        gradientTop = sessionGroupGradientTop,
        gradientBottom = sessionGroupGradientBottom,
    )
}

/** What a status pill says: a status, or a session type. */
enum class PillTone { Neutral, Success, Warning, Danger, Private, Group }

/** A pill's fill and the colour of its text, a declared contrast pair of the tokens. */
@Immutable
data class PillColors(val container: Color, val content: Color)

fun TokenColors.pillColors(tone: PillTone): PillColors = when (tone) {
    PillTone.Neutral -> PillColors(statusNeutralBg, statusNeutralFg)
    PillTone.Success -> PillColors(statusSuccessBg, statusSuccessText)
    PillTone.Warning -> PillColors(statusWarningBg, statusWarningText)
    PillTone.Danger -> PillColors(statusDangerBg, statusDangerText)
    PillTone.Private -> PillColors(sessionPrivateBg, sessionPrivateText)
    PillTone.Group -> PillColors(sessionGroupBg, sessionGroupText)
}

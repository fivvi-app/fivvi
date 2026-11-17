package app.fivvi.core.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.MaterialExpressiveTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MotionScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import app.fivvi.designtokens.DarkColorScheme
import app.fivvi.designtokens.DarkTokenColors
import app.fivvi.designtokens.LightColorScheme
import app.fivvi.designtokens.LightTokenColors
import app.fivvi.designtokens.TokenColors
import app.fivvi.designtokens.TokenShapes

/** The semantic colours of the mode shown, for what Material's colour roles don't cover (sessions, status). */
val LocalTokenColors = staticCompositionLocalOf { LightTokenColors }

/** Whether the theme shows dark mode, for what comes in a light and a dark version (the Fivvi Pro icon on the sign-in). */
val LocalDarkTheme = staticCompositionLocalOf { false }

/** `MaterialTheme.tokens.sessionPrivateBg`: the token colours of the mode the theme shows. */
val MaterialTheme.tokens: TokenColors
    @Composable
    @ReadOnlyComposable
    get() = LocalTokenColors.current

/**
 * Fivvi's Material 3 Expressive theme (ADR-015, ADR-029, spec #590): the colour scheme generated from the design tokens
 * for the system's light or dark mode, the token shapes, Expressive's motion and Material 3's type scale in Google Sans
 * Flex (see [FivviFonts]), so font scaling applies. No dynamic colour (Material You), so the brand looks the same on
 * every phone. [MaterialTheme.tokens] gives the token colours of the same mode.
 */
@OptIn(ExperimentalMaterial3ExpressiveApi::class)
@Composable
fun FivviTheme(darkTheme: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    CompositionLocalProvider(
        LocalTokenColors provides if (darkTheme) DarkTokenColors else LightTokenColors,
        LocalDarkTheme provides darkTheme,
    ) {
        MaterialExpressiveTheme(
            colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme,
            motionScheme = MotionScheme.expressive(),
            shapes = TokenShapes,
            typography = FivviTypography,
            content = content,
        )
    }
}

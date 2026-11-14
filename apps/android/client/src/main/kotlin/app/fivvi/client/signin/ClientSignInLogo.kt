package app.fivvi.client.signin

import app.fivvi.client.R
import app.fivvi.core.R as CoreR
import app.fivvi.core.signin.SignInLogo

/**
 * The icon of Fivvi above the title of both sign-in steps (E020, #634): the plain day dial B2 of `docs/design/brand/day-dial/b2`,
 * light in light mode and dark in dark mode, never the Fivvi Pro one with its PRO label. The pictures are made from the brand
 * files by `pnpm --filter @fivvi/web brand-icons` (Android has no SVG here). Its accessible name is the app's name, *Fivvi*.
 */
val ClientSignInLogo = SignInLogo(R.drawable.fivvi_dial_light, R.drawable.fivvi_dial_dark, CoreR.string.app_title)

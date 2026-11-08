# The Fivvi logo

**Status:** chosen by the owner on 7 November 2026, after ten rounds of concepts. The logo is concept V2 of the tenth round, drawn with Codex's `image_gen` on the owner's ChatGPT subscription and traced to vector with potrace, without changing its shapes. [`visual-direction.md`](../visual-direction.md) places it in the visual direction.

## The idea

"Fivvi" sounds like *high five*. The two v's in the name are two pairs of raised arms that slap together at the top; the pink spark is the clap. Trainer and client, a session done: the moment Fivvi exists for, because it takes care of the rest ("Jij traint. Fivvi regelt de rest.").

The wordmark is heavy, rounded and leans forward, with swelling strokes: playful but confident, so it works for a solo PT, a pilates studio and a gym alike.

## Files

| File | What | Where it goes |
|---|---|---|
| `fivvi-logo.svg` | The wordmark: black letters, pink spark and i dots | Light backgrounds: website, emails, invoices, the trainer web |
| `fivvi-logo-dark.svg` | The wordmark in white, with a lighter pink | Dark backgrounds and dark mode |
| `fivvi-mark.svg` | The vv with the spark, in pink | Where the name is already shown, or there is no room for it |
| `fivvi-mark-white.svg` | The same mark in white | On pink or on photos |
| `day-dial/b2/` | **The app icon**: the day dial B2, as Icon Composer layers and previews | The client app Fivvi, see [The app icon](#the-app-icon-the-day-dial) |
| `day-dial/b2-pro/` | **The Fivvi Pro icon**: B2 with PRO in the centre of the dial | Fivvi Pro, the app for owners and trainers |
| `day-dial/b/` | The day dial B, kept to come back to | Nowhere yet |
| `favicon.svg` | The day dial B2, light, with rounded corners | Browser tabs and bookmarks |
| `fivvi-app-icon.svg`, `-dark.svg`, `-tinted.svg` | The first app icon, the vv on pink; replaced by the day dial on 8 November 2026 | Nowhere; kept for reference |

## Colours

| Role | Light | Dark |
|---|---|---|
| Letters | `#111111` | `#FFFFFF` |
| Spark and i dots | Move pink `#E6164A` | `#FF3D6E` |
| App icon background | `#FFFFFF` to `#ECECF1` | `#2C2C2E` to `#0B0B0C` |
| App icon track | `#E4E4EA` | white at 10% |
| App icon five | Pink gradient in one hue: `#FF4F7B` at the top to `#C8103D` at the bottom | the same |
| Tinted icon | Background `#4A4A4E` to `#1E1E20`, the five in white | |
| Fivvi Pro letters (PRO) | `#1C1C1E` | `#FFFFFF`, also in the tinted icon |

Only Move pink `#E6164A` (the accent, [`visual-direction.md`](../visual-direction.md)) and white are design tokens. The other colours belong to the logo alone: they are not tokens and are not used in the UI. Gradients stay in one hue.

## How to use it

- **Clear space:** keep at least the height of an i dot free around the logo.
- **Smallest size:** the wordmark from 20 px high on a screen; the app icon reads from 29 px (a settings row); PRO in the Fivvi Pro icon reads from about 40 px, and below that the name under the icon carries it.
- **Keep it whole:** the spark, the dots and the letters always go together, in these colours. The letters are never pink.
- **Don't:** stretch, rotate, outline, add shadows or effects, set it in another font, or place it on a busy photo without a calm area.
- **The app icon** is the day dial B2: never the wordmark or the vv in an icon shape.

## The app icon: the day dial

On 8 November 2026 the owner chose the day dial as the app icon, drawn the way Apple draws its own icons: one object, with letters only in the Fivvi Pro version. The dial of a day with **five booked hours** in pink: what Fivvi does (a planned day full of sessions), with a quiet nod to *five* and the high five. It replaces the vv app icon; the vv wordmark stays the logo.

| Version | What | Files |
|---|---|---|
| **B2** (main) | The five hours as separate segments on one faint, continuous ring, so it never reads as a loading spinner, also at 29 px | `day-dial/b2/` |
| **B** (kept to come back to) | The five hours among the twelve hours of the dial, the empty hours in grey | `day-dial/b/` |

**Fivvi Pro** gets **B2 with PRO** in the empty centre of the dial (owner, 8 November 2026): `day-dial/b2-pro/`, with a fourth layer `4-pro.svg`. PRO is drawn as rounded strokes, `#1C1C1E` in light and white in dark and tinted. The client app **Fivvi** keeps the plain B2, so the two apps tell apart on one phone.

Each version has:

- `layers/`: the layers for Icon Composer, 1024 × 1024, transparent and unmasked: `1-background.svg`, `2-track.svg` (B2 and B2 Pro) or `2-hours.svg` (B), `3-five.svg`, and for B2 Pro also `4-pro.svg`. They are flat on purpose: iOS 26 adds the Liquid Glass itself (the rim, depth, the clear look) and makes the dark and tinted icons from them, so no gloss is baked in.
- `fivvi-day-dial-<version>-{light,dark,pink,tinted}.svg`: previews of the layers composed and masked, to look at and share (B2 Pro has light, dark and tinted).

The five are the hours at 11, 12, 3, 6 and 7 on the dial, clockwise from the top. The pink is the gradient of the app icon (`#FF4F7B` to `#C8103D`); white on the pink and tinted previews.

## Still to do

- The app icons in `apps/ios` and `apps/android` still show the placeholder "F": `scripts/app-icon.mjs` will draw the day dial B2 (issue #666), and then PRO in its centre, since these are the Fivvi Pro apps (issue #672).
- The website design (`docs/design/website`) and the public website in `apps/web` still show the text mark; they get the wordmark and the day dial favicon (issue #669). The prototype already shows the day dial.

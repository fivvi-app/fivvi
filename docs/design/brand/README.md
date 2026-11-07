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
| `fivvi-app-icon.svg` | The app icon: the white mark on the pink gradient, 1024 × 1024 | The main icon of the apps |
| `fivvi-app-icon-dark.svg` | The pink mark on near-black | The dark icon (iOS 26 dark appearance, Android dark themes) |
| `fivvi-app-icon-tinted.svg` | The white mark on grey | The base for the tinted icon iOS 26 makes |
| `favicon.svg` | The app icon with rounded corners, the mark a little larger | Browser tabs and bookmarks |

## Colours

| Role | Light | Dark |
|---|---|---|
| Letters | `#111111` | `#FFFFFF` |
| Spark and i dots | Move pink `#E6164A` | `#FF3D6E` |
| App icon background | Pink gradient in one hue: `#FF4F7B` top right, `#E6164A`, `#B80F3A` at the bottom, with a soft light at the top right | `#2A2A2D` to `#0B0B0C` |
| Tinted icon background | `#6E6E73` to `#3A3A3C` | |

Only Move pink `#E6164A` (the accent, [`visual-direction.md`](../visual-direction.md)) and white are design tokens. The other colours belong to the logo alone: they are not tokens and are not used in the UI. Gradients stay in one hue.

## How to use it

- **Clear space:** keep at least the height of an i dot free around the logo.
- **Smallest size:** the wordmark from 20 px high on a screen; the app icon reads from 29 px (a settings row).
- **Keep it whole:** the spark, the dots and the letters always go together, in these colours. The letters are never pink.
- **Don't:** stretch, rotate, outline, add shadows or effects, set it in another font, or place it on a busy photo without a calm area.
- **The app icon** is white on pink. Pink on near-black is only the dark-mode icon.

## Still to do

- The website design (`docs/design/website`) and the prototype (`docs/design/prototype-v2`) still show the text mark and the "F"; they get these files.
- A layered iOS 26 Liquid Glass icon (Icon Composer): the mark and the spark as separate layers.

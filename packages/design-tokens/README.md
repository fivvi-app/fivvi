# @trainer-hub/design-tokens

The one source of Trainer Hub's colours, type, spacing, radii and motion (ADR-015). [Style Dictionary](https://styledictionary.com/) v4 builds the web outputs from it; the Swift and Kotlin outputs follow with issue #38. The rationale behind the values is in [`docs/design/visual-direction.md`](../../docs/design/visual-direction.md).

| File | What |
|---|---|
| `tokens/palette.json` | Base palette (tier 1). Only semantic tokens reference it; apps never use it |
| `tokens/color.light.json` | Semantic colours (tier 2): `color.bg.*`, `color.text.*`, `color.border.*`, `color.action.*`, `color.status.*`, `color.session.*`. Light values, descriptions and platform notes |
| `tokens/color.dark.json` | The dark value of **every** semantic colour, and nothing else |
| `tokens/typography.json`, `layout.json`, `motion.json` | Font families and the type scale (with the native text style each maps to), densities, spacing, radii, sizes, border widths, durations and easing. The same in both modes |
| `tokens/contrast-pairs.json` | Foreground/background pairs that must meet WCAG AA in light and dark |
| `generated/web/tokens.css` | A CSS variable per token (`--th-color-bg-canvas`): light on `:root`, dark under `prefers-color-scheme: dark`. **Generated, never edit** |
| `generated/web/shadcn.css` | shadcn/ui's theme variables (`--background`, `--primary`, `--radius`, …) plus `--session-*` and `--status-*`, each pointing at a token variable. **Generated, never edit** |
| `generated/web/theme.css` | Tailwind v4 `@theme inline` that turns those into utilities (`bg-primary`, `text-session-private-fg`, `rounded-lg`). **Generated, never edit** |
| `src/` | The build, the checks and the CLI (Node only) |

The files are DTCG JSON (`$value`, `$type`, `$description`); a reference is `{color.base.neutral.900}`. Dark values are resolved in dark mode, so a dark value may reference another semantic colour (`{color.bg.subtle}`) and gets its dark value.

## Using the tokens on the web

Import the three files after Tailwind, and use only shadcn's theme classes and our extras, never the `--th-*` variables or the palette:

```css
@import 'tailwindcss';
@import '@trainer-hub/design-tokens/tokens.css';
@import '@trainer-hub/design-tokens/shadcn.css';
@import '@trainer-hub/design-tokens/theme.css';
```

The page follows the system light or dark setting; nothing switches it by hand. shadcn's theme variables map to the semantic tokens as listed in `shadcnColours` in [`src/build.ts`](src/build.ts) (for example `--primary` is `color.action.primary.bg`, `--input` is `color.border.control`). `--radius` is `radius.md`, and Tailwind derives `rounded-sm` to `rounded-xl` from it as in shadcn.

## Changing a token

1. Change the value in `tokens/`. A semantic colour has its light value in `color.light.json` and its dark value in `color.dark.json`; change both when both should change. A new semantic colour needs both too, or the build refuses it.
2. `pnpm --filter @trainer-hub/design-tokens generate` and commit the regenerated `generated/` files.
3. `pnpm check` must pass: it fails when a generated file is stale or when a contrast pair drops below its minimum.

A new colour under `color.session.*` or `color.status.*` automatically becomes a `--session-*` or `--status-*` variable and a Tailwind colour. Any other new colour for the web needs a mapping in `src/build.ts`.

## Adding a contrast pair

Add an entry to `tokens/contrast-pairs.json` for every new foreground/background combination a screen uses:

```json
{ "fg": "color.text.secondary", "bg": "color.bg.raised", "kind": "text", "use": "Meta text in a sheet" }
```

`fg` and `bg` are semantic colours. `kind` is `text` (4.5:1, WCAG 1.4.3) or `non-text` (3:1 for control outlines, focus rings and calendar bars; WCAG 1.4.11 and 2.4.13). `use` says where the pair appears. The check runs every pair in light and dark mode.

## Checks

`pnpm check` (turbo, so CI too) runs `node src/cli.ts check`:

- **generated**: builds every output in memory and compares it with the committed file. It names each stale, missing or stray file under `generated/`.
- **contrast**: computes the WCAG contrast of every pair in both modes and names each failing pair with its mode and ratio, rounded down.

Run one with `node src/cli.ts check generated` or `check contrast`. The tests are in `test/`: `build.test.ts`, `check.test.ts` and `contrast.test.ts`.

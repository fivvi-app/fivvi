# @fivvi/design-tokens

The one source of Fivvi's colours, type, spacing, radii and motion (ADR-015). [Style Dictionary](https://styledictionary.com/) v4 resolves it, and one build generates the web, iOS (Swift) and Android (Kotlin) outputs. The rationale behind the values is in [`docs/design/visual-direction.md`](../../docs/design/visual-direction.md).

| File | What |
|---|---|
| `tokens/palette.json` | Base palette (tier 1). Only semantic tokens reference it; apps never use it |
| `tokens/color.light.json` | Semantic colours (tier 2): `color.bg.*`, `color.text.*`, `color.border.*`, `color.action.*`, `color.status.*`, `color.session.*`. Light values, descriptions and platform notes |
| `tokens/color.dark.json` | The dark value of **every** semantic colour, and nothing else |
| `tokens/typography.json`, `layout.json`, `motion.json` | Font families and the type scale (with the native text style each maps to), densities, spacing, radii, sizes, border widths, durations and easing. The same in both modes |
| `tokens/contrast-pairs.json` | Foreground/background pairs that must meet WCAG AA in light and dark |
| `generated/web/tokens.css` | A CSS variable per token (`--th-color-bg-canvas`): light on `:root`, dark under `prefers-color-scheme: dark`. **Generated, never edit** |
| `generated/web/shadcn.css` | shadcn/ui's theme variables (`--background`, `--primary`, `--radius`, …) plus `--session-*` and `--status-*`, each pointing at a token variable. **Generated, never edit** |
| `generated/web/theme.css` | Tailwind v4 `@theme inline` that turns those into utilities (`bg-primary`, `text-session-private-fg`, `rounded-lg`, `font-display`). **Generated, never edit** |
| `FivviDesignTokens/` | The SwiftPM package `FivviDesignTokens` for iOS. `Package.swift` is hand-written; `Sources/FivviDesignTokens/Generated/` is **generated, never edit**. The directory is named after the package because Xcode takes a local package's identity from its directory name: a second `swift/` beside `packages/contract/swift` would clash in the app |
| `kotlin/generated/` | Kotlin sources for Compose, package `app.fivvi.designtokens`. **Generated, never edit** |
| `src/` | The build, the checks and the CLI (Node only). `src/native.ts` renders the Swift and Kotlin |

The files are DTCG JSON (`$value`, `$type`, `$description`); a reference is `{color.base.neutral.900}`. Dark values are resolved in dark mode, so a dark value may reference another semantic colour (`{color.bg.subtle}`) and gets its dark value.

## Using the tokens on the web

Apps don't import these files themselves: they import the kit's stylesheet, `@fivvi/ui/globals.css`, which loads Tailwind, the three token files and the kit's base styles in the right order ([`packages/ui/README.md`](../ui/README.md)). App code uses only shadcn's theme classes and our extras, never the `--th-*` variables or the palette.

The page follows the system light or dark setting; nothing switches it by hand. shadcn's theme variables map to the semantic tokens as listed in `shadcnColours` in [`src/build.ts`](src/build.ts) (for example `--primary` is `color.action.primary.bg`, `--input` is `color.border.control`). `--radius` is `radius.md`, and Tailwind derives `rounded-sm` to `rounded-xl` from it as in shadcn. `font-sans` is `font.family.text` (the system font) and `font-display` is `font.family.display` (Bricolage Grotesque, then the system font).

The two web densities take their body size from `density.compact.body` and `density.touch.body`, and their control size from `size.control.compact` and `size.control.touch`; the kit applies them per layout ([densities](../ui/README.md#densities)).

## Using the tokens on iOS and Android

The native outputs ship like `packages/contract`'s clients: committed sources that E008 adds to the apps, a local Swift package for iOS and a source directory compiled in a Gradle module for Android. They hold the semantic colours, spacing, radii and type styles; never the base palette. Native typography is the platform's: each type style in `tokens/typography.json` has a mapping note (`$extensions` `app.fivvi.platform`) that names an iOS text style and a Material 3 role. The generated code maps to those styles and has no font sizes, so Dynamic Type and font scaling apply. A note may add a weight or figures after the style (`subheadline.weight(.semibold)`, `displaySmall + tnum`), never a size.

**iOS** (`FivviDesignTokens/`, iOS 15 or macOS 12 and up; the app links it as a local package, [`apps/ios`](../../apps/ios/README.md#theme)):

| Generated | What |
|---|---|
| `Tokens.Colors` | Every semantic colour as a SwiftUI `Color` that follows the system appearance (light and dark): `Tokens.Colors.bgCanvas`, `Tokens.Colors.actionPrimaryBg` |
| `Tokens.Spacing`, `Tokens.Radius` | Points as `CGFloat`: `Tokens.Spacing.space4`, `Tokens.Spacing.gutter`, `Tokens.Radius.md` (use `.continuous` corners) |
| `Tokens.TextStyle` | The `Font.TextStyle` of each type style: `.font(.system(Tokens.TextStyle.body))` |

**Android** (`kotlin/generated/`, Compose Material 3 1.2 or later):

| Generated | What |
|---|---|
| `LightColorScheme`, `DarkColorScheme` | Material 3 `ColorScheme`s: `MaterialTheme(colorScheme = if (isSystemInDarkTheme()) DarkColorScheme else LightColorScheme)` |
| `LightTokenColors`, `DarkTokenColors` | Every semantic colour (`TokenColors`), for what Material doesn't cover: sessions and status |
| `Spacing`, `Radius`, `TokenShapes` | `Dp` values (`Spacing.space4`, `Radius.md`) and Material 3 `Shapes` from the radius tokens whose android note names a shape (`shapes.small`) |
| `Typography.body`, `Typography.label`, … | Each type style as its Material 3 role: `MaterialTheme.typography.body` is `bodyLarge` |

Names are the token path without its group, in camel case (`color.action.primary.bg-pressed` is `actionPrimaryBgPressed`, `space.0-5` is `space0_5`). The Material 3 roles map to tokens as listed in `materialColours` in [`src/native.ts`](src/native.ts): the roles the token descriptions name, a neutral secondary and tertiary (there is one accent), and `surfaceTint` on the canvas so elevation adds no tint. Every content role (`onPrimary`, `onSurface`, …) sits on its role as a declared contrast pair. `scrim` keeps Material's black.

## Changing a token

1. Change the value in `tokens/`. A semantic colour has its light value in `color.light.json` and its dark value in `color.dark.json`; change both when both should change. A new semantic colour needs both too, or the build refuses it.
2. `pnpm --filter @fivvi/design-tokens generate` and commit the regenerated files under `generated/`, `FivviDesignTokens/Sources/` and `kotlin/generated/`.
3. `pnpm check` must pass: it fails when a generated file is stale or when a contrast pair drops below its minimum.

A new colour under `color.session.*` or `color.status.*` automatically becomes a `--session-*` or `--status-*` variable and a Tailwind colour. Any other new colour for the web needs a mapping in `src/build.ts`. Every semantic colour becomes a Swift and Kotlin colour automatically; one that a Material 3 role should take needs a mapping in `src/native.ts`.

## Adding a contrast pair

Add an entry to `tokens/contrast-pairs.json` for every new foreground/background combination a screen uses:

```json
{ "fg": "color.text.secondary", "bg": "color.bg.raised", "kind": "text", "use": "Meta text in a sheet" }
```

`fg` and `bg` are semantic colours. `kind` is `text` (4.5:1, WCAG 1.4.3) or `non-text` (3:1 for control outlines, focus rings and calendar bars; WCAG 1.4.11 and 2.4.13). `use` says where the pair appears. The check runs every pair in light and dark mode.

## Checks

`pnpm check` (turbo, so CI too) runs `node src/cli.ts check`:

- **generated**: builds every output (web, Swift, Kotlin) in memory and compares it with the committed file. It names each stale, missing or stray file under `generated/`, `FivviDesignTokens/Sources/FivviDesignTokens/Generated/` and `kotlin/generated/`.
- **contrast**: computes the WCAG contrast of every pair in both modes and names each failing pair with its mode and ratio, rounded down.

Run one with `node src/cli.ts check generated` or `check contrast`. The tests are in `test/`: `build.test.ts`, `check.test.ts`, `contrast.test.ts` and `platforms.test.ts` (the Material 3 roles, adaptive iOS colours and no fixed native font sizes). They read the generated Swift and Kotlin as text; E008's app builds compile them.

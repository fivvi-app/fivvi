# Design: Fivvi

The locked design system. Design tools and skills (Hallmark, shadcn generators, Figma and the like) read this file first and defer to it: they don't bring a theme, pick fonts or write a token file of their own. A change to the system is made in the sources below, on purpose, never by a page or a screen.

## Sources of truth

| What | Where |
|---|---|
| Colours, type scale, spacing, radii, motion, densities, contrast pairs | [`packages/design-tokens`](packages/design-tokens/README.md) (DTCG JSON in `tokens/`, built by Style Dictionary). Its outputs are generated and never edited |
| Why the values are what they are | [`docs/design/visual-direction.md`](docs/design/visual-direction.md) |
| Shared tokens, native controls per platform | [ADR-015](docs/decisions/ADR-015-ui-foundation.md) |
| Screens, flows, states and copy | [`docs/design/`](docs/design/README.md) (screen IDs, wireframes, platform notes per flow) |
| Every user-facing string | `packages/i18n/{nl-NL,en}.json`, Dutch first ([`packages/i18n`](packages/i18n/README.md)) |

## Character

Calm but warmer, readable in a busy gym: time, client, location, capacity and the next action come first. White, light grey and charcoal carry surfaces and navigation; a muted violet marks the primary action and the selection. Colour sits on chips, small accents and the primary action, never on large surfaces. The session type is shown in words, never by colour alone. Light and dark follow the system setting.

## Web (`apps/web`, `packages/ui`)

- shadcn/ui on Tailwind v4, themed only by the tokens: import `@fivvi/ui/globals.css` and use shadcn's theme classes plus `session-*` and `status-*` ([`packages/ui`](packages/ui/README.md)). Tailwind's default palette is removed; no literal colours, no `--th-*` variables or palette in app code.
- Two densities by `data-density`: `compact` for Trainer Web on a desktop pointer, `touch` for public and client pages.
- System font for text, forms and data. Bricolage Grotesque (`font-display`) only for headings on public pages and brand moments, never for body text or form labels.
- A new colour pair on screen is a new entry in `packages/design-tokens/tokens/contrast-pairs.json` (AA in light and dark).

## iOS (`apps/ios`) and Android (`apps/android`)

The tokens are shared; the look is native. Same flows, content and capability on both, not the same layout ([ADR-015](docs/decisions/ADR-015-ui-foundation.md), [visual direction](docs/design/visual-direction.md#spacing-shape-and-targets)).

- **iOS:** SwiftUI with native controls, following the HIG. Colours from `Tokens.Colors`, spacing and corners from `Tokens.Spacing` and `Tokens.Radius` (continuous corners), text in the token's Dynamic Type style, never a size ([`apps/ios`](apps/ios/README.md#theme)).
- **Android:** Compose with Material 3. Screens sit in `FivviTheme` (the token colour schemes and `TokenShapes`). Colours from `MaterialTheme.colorScheme`, and, where Material has no role, from `LightTokenColors` or `DarkTokenColors` for the same mode, added through `FivviTheme` so screens don't each pick the mode; spacing from `Spacing`; text in `MaterialTheme.typography` roles, never a size; no dynamic colour ([`apps/android`](apps/android/README.md)).
- Structure differs per platform on purpose: large titles and inset grouped lists on iOS; a top app bar, a selected navigation indicator and segmented buttons on Android ([visual direction](docs/design/visual-direction.md#spacing-shape-and-targets)).
- Densities and touch targets: see the [visual direction](docs/design/visual-direction.md#density) and its [spacing, shape and targets](docs/design/visual-direction.md#spacing-shape-and-targets). Sheets, tab bars and pickers follow each platform's native controls.

## Not for design tools to decide

- No theme, font, palette or token file from a tool's own catalogue; map onto the existing token names.
- Never real data. Examples use the fictional sample data from `PRODUCT.md`, as in the wireframes ([`docs/design/`](docs/design/README.md)), synthetic only.
- No hard-coded copy: strings come from `packages/i18n`.

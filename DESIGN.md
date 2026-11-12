# Design: Fivvi

The locked design system, and how design decisions are made. Design tools and skills (Hallmark, shadcn generators, Figma and the like) read this file first and defer to it: they don't bring a theme, pick fonts or write a token file of their own. A change to the system is made in the sources below, on purpose, never by a page or a screen.

## Sources of truth

| What | Where |
|---|---|
| The look of every screen, and what the owner decided | [The clickable prototype](docs/design/prototype-v2/README.md) and its [`DECISIONS.md`](docs/design/prototype-v2/DECISIONS.md) |
| The public website's look and words | The [Fivvi Website design](docs/design/website/README.md), with the decisions in `DECISIONS.md` §9 |
| Colours, type scale, spacing, radii, motion, densities, contrast pairs | [`packages/design-tokens`](packages/design-tokens/README.md) (DTCG JSON in `tokens/`, built by Style Dictionary). Its outputs are generated and never edited. It holds the v2 values of the Design v2 foundation ([#590](https://github.com/fivvi-app/fivvi/issues/590)); no M0 value is left (a test fails on one) |
| Why the values are what they are | [`docs/design/visual-direction.md`](docs/design/visual-direction.md) |
| Platforms, and shared tokens with native controls | [ADR-029](docs/decisions/ADR-029-design-v2.md) and [ADR-015](docs/decisions/ADR-015-ui-foundation.md) |
| Screens, flows, states and copy | [`docs/design/`](docs/design/README.md) (screen IDs, wireframes, platform notes per flow). Where a flow and `DECISIONS.md` disagree on the look, `DECISIONS.md` wins |
| Every user-facing string | `packages/i18n/{nl-NL,en}.json`, Dutch first ([`packages/i18n`](packages/i18n/README.md)) |

## Character

**Calendar calm, Fitness pops.** Fivvi looks like it belongs next to Apple Calendar, Fitness and Health, and reads clearly in a busy gym: time, client, location, capacity and the next action come first.

- **Calm:** a grouped grey canvas, white cards, inset lists, true black in dark mode.
- **Energy:** gradient cards in one hue, rounded numbers, sharp colour in small doses, with **Move pink** as the only accent.
- The session type is shown in words, never by colour alone. Light and dark follow the system setting.
- The UI only shows what exists: a solo PT never sees group classes or Open Gym. Every list can be added to, changed and removed from, and every removal asks for confirmation.

## Design first, where design matters

Where the design matters, the owner decides by **talking it over in the clickable prototype**, not in text (owner, 5 November 2026). This keeps what gets built exactly what was agreed.

**Prototype before the spec:**

- a new screen or flow, or a new state the user sees: an empty state, an error, a confirmation;
- a visible change to how a screen looks or works: layout, hierarchy, navigation, what is shown or hidden for a role or a setup;
- a product question a screen makes concrete, such as how a duo session, a renewal or a class level looks to the trainer and the client.

**Skip it** for work where design doesn't matter:

- work without a screen: the API, data and migrations, jobs, infrastructure, security, tooling, agent rules;
- a bug fix or a small change that follows a pattern already in the prototype and `DECISIONS.md`, such as another field in an existing form or another row in an existing list;
- copy and translation fixes, and a token value that `visual-direction.md` already fixes.

**When in doubt, ask the owner** whether it needs a design round.

**How:**

1. **Build the proposal in [`docs/design/prototype-v2`](docs/design/prototype-v2/README.md).** It is plain HTML, CSS and JavaScript with no build step. Follow the existing parts: the app components in `app.js`, the web pages in `web.js`, the English layer in `i18n.js`. Use fictional data only. Every screen works in Dutch and English, light and dark, and every business setup it applies to. When a screen should look different for a role or a setup, show each version.
2. **Check it before showing it**, in a browser across the panel's screen index: no script errors, no Dutch left in English, no overflow, contrast of 4.5:1 for text and 3:1 for icons (the one exception is in [ADR-032](docs/decisions/ADR-032-secondary-text-in-the-native-apps.md)), buttons that aren't squashed, and nothing in a list cut off with "…".
3. **Publish it** to the "Fivvi Prototype" artifact, and ask the owner to click through it.
4. **Act on every comment:** change the prototype, republish, and reply in the comment's thread. Leave resolving to the owner. When something can't be decided from the docs, ask, and put the assumption on screen.
5. **Record each decision** in `DECISIONS.md`, with the screen and where it lands: an existing spec gets a comment; a new product decision gets a placeholder spec (`spec` + `needs-triage`); a conflict with an older doc goes in its §8 and gets a short note in that doc. **Update the existing doc rather than adding a new one** (owner, 5 November 2026).
6. **Then write the spec** (`work` → **Shape**). It names the prototype screens it implements under **UX**. Its acceptance criteria match `DECISIONS.md`, including the assumptions the owner has since confirmed.

**Rules:**

- The prototype shows look and flow, never architecture. Business rules stay in `packages/domain`; strings in the product come from `packages/i18n`.
- `DECISIONS.md` §7 lists the prototype's assumptions and which of them the owner confirmed. A spec builds a confirmed one as written. It asks the owner about any other it touches, and never builds that as if it were decided.

## Web (`apps/web`, `packages/ui`)

- shadcn/ui on Tailwind v4, themed only by the tokens (zinc neutrals and the accent on the trainer web, the Fivvi Pro theme on the client web): import `@fivvi/ui/globals.css` and use shadcn's theme classes plus `session-*` and `status-*` ([`packages/ui`](packages/ui/README.md)). Tailwind's default palette is removed; no literal colours, no `--th-*` variables or palette in app code.
- Two densities by `data-density`: `compact` for Trainer Web on a desktop pointer, `touch` for public and client pages. The client web is a mobile website in the same design language as Fivvi Pro.
- The system font for text and forms; numbers use a rounded face with tabular digits. No web font is loaded and there is no `font-display`.
- A new colour pair on screen is a new entry in `packages/design-tokens/tokens/contrast-pairs.json` (AA in light and dark).

## iOS (`apps/ios`) and Android (`apps/android`)

The tokens are shared; the look is native. Same flows, content and capability on both, not the same layout ([ADR-029](docs/decisions/ADR-029-design-v2.md), [visual direction](docs/design/visual-direction.md#platforms)).

- **iOS 26 with Liquid Glass:** SwiftUI with native controls, following the HIG: glass navigation buttons, a floating glass tab bar that shrinks while scrolling, glass sheets and alerts, large titles. Colours from `Tokens.Colors`, spacing and corners from `Tokens.Spacing` and `Tokens.Radius` (continuous corners), text in the token's Dynamic Type style, never a size ([`apps/ios`](apps/ios/README.md#theme)). The deployment target of every target is 26.0.
- **Android with Material 3 Expressive:** Compose with Material 3 Expressive (`material3` on the `1.5` release candidate) and Google Sans Flex, which ships inside the app. Screens sit in `FivviTheme` (the token colour schemes and `TokenShapes`). Colours from `MaterialTheme.colorScheme`, and, where Material has no role, from `LightTokenColors` or `DarkTokenColors` for the same mode, added through `FivviTheme` so screens don't each pick the mode; spacing from `Spacing`; text in `MaterialTheme.typography` roles, never a size; no dynamic colour ([`apps/android`](apps/android/README.md)). Single-choice toggles use the M3 segmented button, not the Expressive connected button group.
- Structure differs per platform on purpose: large titles and inset grouped lists on iOS; a top app bar, a selected navigation indicator, shaped avatars per session type and segmented buttons on Android.
- Densities, type and shape: see the [visual direction](docs/design/visual-direction.md#type-shape-and-spacing). The minimum touch target is `size.touch-min` in [`tokens/layout.json`](packages/design-tokens/tokens/layout.json). Sheets, tab bars and pickers follow each platform's native controls.

## Not for design tools to decide

- No theme, font, palette or token file from a tool's own catalogue; map onto the existing token names.
- Never real data. Examples use the fictional sample data from `PRODUCT.md`, as in the wireframes ([`docs/design/`](docs/design/README.md)), synthetic only.
- No hard-coded copy: strings come from `packages/i18n`.

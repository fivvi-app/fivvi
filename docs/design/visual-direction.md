# Fivvi visual direction (v2)

**Status:** decided with the owner on 5 November 2026 in the clickable prototype ([`prototype-v2`](prototype-v2/README.md)), recorded in [ADR-029](../decisions/ADR-029-design-v2.md) and [`DECISIONS.md`](prototype-v2/DECISIONS.md). It replaces the M0 direction (a muted violet, calm and monochrome; see this file's git history). The source of truth for values stays [`packages/design-tokens`](../../packages/design-tokens/README.md) (ADR-015); the v2 values move there with the "Design v2 foundation" spec ([#590](https://github.com/fivvi-app/fivvi/issues/590)). Until then the package still holds the M0 values.

## Character

**Calendar calm, Fitness pops.** Fivvi looks like it belongs next to Apple Calendar, Fitness and Health on the phone:

- **Calm, from Calendar:** a grouped grey canvas, white cards, inset lists, time first.
- **Energy, from Fitness:** gradient cards, rounded numbers, sharp colour in small doses.

It reads clearly in a busy gym: time, client, location, capacity and the next action come first.

- **The UI only shows what exists.** A solo PT never sees group classes or Open Gym.
- **Every list can be added to, changed and removed from**, and every removal asks for confirmation.

## Platforms

| Platform | Look |
|---|---|
| iOS 26+ | Liquid Glass: glass navigation buttons, a floating glass tab bar that shrinks while scrolling, glass sheets and alerts, large titles with the date above them, SF Pro and SF Pro Rounded |
| Android | Material 3 Expressive: top app bar, navigation bar, FAB, M3 segmented buttons (an outlined pill with a check), shaped avatars per session type, Google Sans Flex |
| Trainer web | shadcn/ui with zinc neutrals: sidebar, top bar with search and **+ Nieuw**, tables, dialogs, side sheets |
| Client web | A mobile website in the same design language as Fivvi Pro |

## Colour

| Role | Light | Dark |
|---|---|---|
| Canvas | `#F2F2F7` (grouped grey) | `#000000` |
| Card | `#FFFFFF` | `#1C1C1E` |
| Label | `#000000` | `#FFFFFF` |
| Secondary text, native apps | `#85858B` | `#98989F` |
| Secondary text, client web | `#6C6C70` | `#98989F` |
| Accent (Move pink) | `#E6164A`, text `#C8103D` | `#E6164A`, text `#FF6482` |
| Private / group / Open Gym | `#0088FF` / `#CB30E0` / `#FF8D28` | same |
| Success / danger | `#34C759` / `#FF383C` | same |

- **Gradients stay in one hue.** A card in the session type's colour is darker at the bottom, with a soft highlight at the top right.
- **Contrast:**
  - text at least 4.5:1, icons and graphics at least 3:1, in light and dark, with one exception: the native apps' secondary text in light mode ([ADR-032](../decisions/ADR-032-secondary-text-in-the-native-apps.md));
  - white glyphs sit on the colour mixed with black (85% → 75%);
  - coloured glyphs on tints use the colour mixed with the mode's ink (78%).
- **On the accent,** anything uses the on-accent colour.

## Type, shape and spacing

- **Text:** SF Pro on iOS, Google Sans Flex on Android, the system stack on the web.
- **Numbers:** a rounded face with tabular digits.
- **Large titles:** 34 pt on iOS, with a 13 pt uppercase eyebrow (the date) above them.
- **Shape:**
  - cards and inset lists have radius 26 (iOS) and 28 (Android);
  - buttons are pills (50 pt on iOS);
  - round controls stay round;
  - grouped buttons are equal width.
- **Spacing:** a 4 px scale, 16 px phone gutters. Stacked buttons keep 48 pt with 10 pt between them.
- **Density** stays as in M0: compact on the trainer web, platform text sizes in the apps, a large logger.

## Where to look

Every screen is in the prototype. Its panel switches iOS, Android, trainer web and client web, the language, light and dark, the accent, the role and five business setups. [`DECISIONS.md`](prototype-v2/DECISIONS.md) lists what was decided per screen and what is still open.

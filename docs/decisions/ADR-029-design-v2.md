# ADR-029: Design v2: iOS 26 with Liquid Glass, Material 3 Expressive, shadcn/ui, one Calendar-and-Fitness theme

| | |
|---|---|
| **Status** | Accepted (2026-11-05). **Replaces** the iOS minimum in ADR-003; **refines** the look of ADR-015 |
| **Date** | 2026-11-05 |
| **Deciders** | Keyvan Mahmoudi (owner) |
| **Related** | ADR-003, ADR-015, ADR-026; [`docs/design/prototype-v2/DECISIONS.md`](../design/prototype-v2/DECISIONS.md); E007, E008, E017 |

## Context

Before any trainer screen was built in earnest, the owner wanted the apps to follow the latest platform design and to share the details of Apple Calendar, Fitness and Health. That means the gradients, the sharp colours, fonts, spacing, shadows, borders and radii. The M0 visual direction (a muted violet, calm and monochrome) didn't do that.

On 5 November 2026 the owner and the agent settled the look in a clickable prototype (`docs/design/prototype-v2`). It has Fivvi Pro on iOS and Android, the trainer web and the client web, five business setups, and Dutch and English. Every screen was reviewed by the owner through comments. The decisions are recorded in `DECISIONS.md`.

The latest iOS design, Liquid Glass, needs **iOS 26**. ADR-003 set the minimum at iOS 17.0. That rule had no confirmed iPhone among the pilot trainers behind it, so raising the minimum costs no pilot user today.

## Decision

- **iOS: minimum iOS 26**, with Liquid Glass:
  - glass navigation buttons;
  - a floating glass tab bar that shrinks while scrolling;
  - glass sheets and alerts;
  - large titles.
  - It replaces iOS 17.0 in ADR-003. iOS 26 runs on the iPhone 11 and newer; check Apple's list before the first release.
- **Android: Material 3 Expressive** with Compose `material3` 1.5 (a release candidate in November 2026; use the stable release once it ships), and Google Sans Flex.
  - Single-choice toggles use the M3 segmented button, not the Expressive connected button group (the owner rejected it twice).
  - The minimum stays Android 8.0 (API 26).
- **Web: shadcn/ui**, with zinc neutrals, as in ADR-015.
- **One theme on every platform:** "Calendar calm, Fitness pops".
  - Base: a grouped grey canvas with white cards, true black in dark mode, and inset grouped lists with radius 26.
  - Accent: **Move pink `#E6164A`**, the only accent (owner, 6 November 2026; this drops the black-and-white alternative first recorded here).
  - Session-type colours: private `#0088FF`, group `#CB30E0`, Open Gym `#FF8D28`.
  - Gradients stay in one hue; numbers use a rounded face with tabular digits.
  - Contrast: text 4.5:1, icons 3:1, in light and dark.
  - The values go into `packages/design-tokens` and reach all platforms through it, as ADR-015 already says.
- **The client web** uses the same design language as Fivvi Pro, as a mobile website (ADR-026).
- **Design first, where design matters:** a new screen or flow, a visible change to one, or a product question a screen makes concrete is decided in the clickable prototype with the owner before a spec is written. Work without a screen, and small changes that follow an existing pattern, skip it ([`DESIGN.md`](../../DESIGN.md)).

## Consequences

- **Positive:** one theme everywhere, close to the platforms' own apps, and settled before most screens are built, so little has to be redone.
- **Positive:** the prototype is a reference every spec can point to, screen by screen.
- **Negative:** iOS 26 excludes iPhones older than the iPhone 11. No pilot trainer is affected today.
- **Negative:** what is already built follows the M0 look and must move to v2:
  - the tokens (E007);
  - the iOS deployment target (E008, from 17.0 to 26.0);
  - the sign-in, workspace, trainers, settings and profile screens.
- **Negative:** Material 3 Expressive depends on a release candidate until `material3` 1.5 is stable.
- **Follow-up:** the "Design v2 foundation" spec ([#590](https://github.com/fivvi-app/fivvi/issues/590)) carries the token values, the iOS target, the Compose and shadcn themes, and the rework of the screens already built. It should land before more M4 screens are built on the old look.

## Alternatives considered

| Option | Why not |
|---|---|
| Keep the M0 direction (muted violet, calm monochrome) | The owner wanted the detail and energy of Calendar, Fitness and Health |
| Liquid Glass with an iOS 17 minimum, behind availability checks | Two looks to build and test on iOS, for no pilot user |
| A custom design system instead of the platforms' own | Loses the native feel ADR-003 and ADR-015 chose |

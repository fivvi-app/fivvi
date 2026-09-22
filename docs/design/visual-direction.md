# Trainer Hub visual direction (M0 draft)

**Status:** draft for pilot validation, 22 September 2026. This is the visual direction for the [six critical flows](README.md), not a final component library. E007 adopts and builds the [draft tokens](tokens.draft.json) in M1 under ADR-015.

## Character and hierarchy

Trainer Hub should read clearly in a busy gym: time, client, location, capacity, and the next action come first. The palette uses cool neutral surfaces and deep petrol for actions. Blue identifies private sessions, violet group classes, and amber Open Gym. Every use of these colours also has a text label or icon. Destructive actions use red and an explicit confirmation.

The web prototype uses restrained branded headings. Forms, calendars, and mobile app content use system text. Trainer data and notes stay legible at arm's length. The prototype's sample names and notes are fictional; note content is trainer-only by default.

## Colour and contrast

| Role | Light | Dark | Use |
|---|---|---|---|
| Canvas / surface | `#F6F8F7` / `#FFFFFF` | `#0E1312` / `#161C1B` | Page and card hierarchy |
| Primary / secondary text | `#161C1B` / `#46524F` | `#F6F8F7` / `#A9B5B2` | Main copy and metadata |
| Primary action / on action | `#0C6A5C` / white | `#5DB8A8` / `#0E1312` | Main action and selected state |
| Tonal action | `#E6F4F1` / `#0A433B` | `#09332E` / `#C4E6DF` | Secondary actions and chips |
| Destructive action | `#A3261A` / white | `#F09A8E` / `#0E1312` | Cancel class confirmation |
| Private / group / Open Gym | Blue / violet / amber | Lighter blue / violet / amber | Calendar type, always with text |

The token checker measures the foreground/background pairs used in the prototype in both appearances. All **25 pairs pass**: ordinary text and labels meet at least **4.5:1**; control outlines, focus rings, and calendar bars meet at least **3:1**. The tightest checked text pair is dark placeholder text on a surface at **4.93:1**. The tightest checked non-text pair is the light Open Gym calendar bar on a surface at **3.17:1**. Decorative hairlines are not used to identify controls. Run `node docs/design/prototype/gen-tokens.mjs --check` for the complete current table. These are token-pair checks, not a claim that every possible rendered combination has been audited. The thresholds come from [WCAG 2.2 text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum) and [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast).

## Typography

| Token | Default size / line height | Use | iOS style | Material 3 style |
|---|---:|---|---|---|
| Display | 34 / 40 | Public entry and rare brand moments | Large Title | Headline Large |
| Title 1 | 28 / 34 | Screen heading | Title | Headline Medium |
| Title 2 | 22 / 28 | Sheet and section heading | Title 2 | Title Large |
| Headline | 17 / 22 | Item title | Headline | Title Medium |
| Body | 17 / 24 | Main text and form values | Body | Body Large |
| Subhead / label | 15 / 20 | Supporting text / actions | Subheadline | Body Medium / Label Large |
| Footnote / caption | 13 / 18 and 12 / 16 | Metadata / section label | Footnote / Caption | Body Small / Label Medium |
| Numeric XL | 40 / 44 | Weight and reps while logging | Scaled large title with tabular digits | Display Small with tabular digits |

Web body text uses the system stack. Bricolage Grotesque is an optional web display accent with a system fallback; it never carries form labels. iOS uses SF Pro through semantic SwiftUI text styles and Dynamic Type; Android uses the Material 3 type roles and system font scaling. Default token sizes are references for web and native mappings, not fixed native font sizes. Web inputs stay at 16 px or above. See [Apple typography](https://developer.apple.com/design/human-interface-guidelines/typography) and [Material 3 in Compose](https://developer.android.com/develop/ui/compose/designsystems/material3).

## Spacing, shape, and targets

- Spacing follows a 4 px scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Phone gutters start at 16; wider layouts use 24.
- Radii are 4, 8, 12, 16, 28, and full pill. iOS uses continuous corners and inset grouped lists. Material 3 maps these to its extra small through extra large shape roles.
- Interactive targets are at least 48 pt/dp in the native interpretation; the workout logger uses 64 for set controls. Web focus is a visible 2 px ring with offset. Reduced-motion preferences suppress decorative transitions.
- Safe areas, back navigation, sheets, tab bars, pickers, and destructive confirmations follow each platform's native controls in the product. The HTML prototype approximates these patterns to test flow and hierarchy. iOS uses a large title and back label; Android uses a top app bar, selected navigation indicator, and segmented buttons. [Apple colour guidance](https://developer.apple.com/design/human-interface-guidelines/color) and [Material 3 theming](https://developer.android.com/develop/ui/compose/designsystems/material3) guide the M1/M8 mapping.

## Token handoff to E007

`tokens.draft.json` uses Style Dictionary v4's DTCG `$type` and `$value` format, aliases, semantic colour roles, and light/dark values in `app.trainerhub.mode` extensions. The no-dependency [prototype generator](prototype/gen-tokens.mjs) writes the checked `tokens.css` for this static prototype. E007 should move the source to `packages/design-tokens`, split light and dark theme sources as appropriate, and generate web CSS/Tailwind values plus Swift and Kotlin constants. Native mappings should feed SwiftUI semantic styles and Compose `MaterialTheme(colorScheme, typography, shapes)`; they should not replace native controls. Generated files are committed and checked for drift under ADR-015. See [Style Dictionary's DTCG support](https://styledictionary.com/info/tokens/).

Pilot feedback may change palette, type, or spacing before E007. Record findings through [`docs/discovery/prototype-validation-script.md`](../discovery/prototype-validation-script.md).

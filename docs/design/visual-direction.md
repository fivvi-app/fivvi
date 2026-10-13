# Trainer Hub visual direction (M0 draft)

**Status:** draft for pilot validation, refined 13 October 2026 after owner feedback. This is the visual direction for the [critical flows](README.md), not a final component library. E007 adopts and builds the [draft tokens](tokens.draft.json) in M1 under ADR-015.

## Character and hierarchy

Trainer Hub should read clearly in a busy gym: time, client, location, capacity, and the next action come first. The owner selected **mostly monochrome, with colour only for status and small icons**. White, light-grey and charcoal carry surfaces, primary actions and navigation; there are no teal brand blocks or large blue/violet/amber card fills. Small blue markers identify private sessions, violet group classes, and amber Open Gym, paired with programmatic labels and meaningful icons. Destructive actions use red and an explicit confirmation; success states may use green.

**Calm light first.** The prototype starts light even on a dark OS; a deliberate Light/Dark appearance control does not persist between visits. Dark uses softened charcoal layers and off-white text, not near-black walls. Colour is concentrated in small meaningful SVG/type/status markers, not the main action or large surfaces. Ambiguous controls retain labels, and compact session/capacity graphics have programmatic labels.

**Fewer competing facts.** The hub is a grid of flow tiles, not seven explanatory paragraphs. Today highlights the next client and workout action; its time agenda drops repeated type/workspace words. Contact details, workspace context, attendance and trainer-only notes use deliberate, named disclosures. Booking shows class/time above the two inputs; privacy, capacity and auth warnings stay explicit. Workout results use two numeric blocks with an expandable set breakdown; client-message review remains mandatory before sharing. See the [prototype measurements](prototype/README.md#owner-feedback-refinement-13-october-2026) for before/after viewport text counts.

The web prototype uses restrained branded headings. Forms, calendars, and mobile app content use system text. Trainer data and notes stay legible at arm's length. The prototype's sample names and notes are fictional; note content is trainer-only by default.

## Colour and contrast

| Role | Light | Dark | Use |
|---|---|---|---|
| Canvas / surface | `#F6F6F7` / `#FFFFFF` | `#242428` / `#2D2D32` | Page and card hierarchy |
| Primary / secondary text | `#202026` / `#4D4D54` | `#E8E8ED` / `#C5C5CB` | Main copy and metadata |
| Primary action / on action | `#202026` / white | `#C8C8CD` / `#16161B` | Main action and selected state |
| Tonal action | `#EEEEF0` / `#202026` | `#3A3A41` / `#C8C8CD` | Neutral secondary actions and chips |
| Destructive action | `#A3261A` / white | `#F09A8E` / `#16161B` | Cancel class confirmation |
| Private / group / Open Gym | Blue / violet / amber markers | Lighter blue / violet / amber markers | Small icons/edges; neutral card fills; programmatic type labels |

The token checker measures the foreground/background pairs used in the prototype in both appearances. All **29 pairs pass**: ordinary text and labels meet at least **4.5:1**; control outlines, focus rings, and calendar bars meet at least **3:1**. It includes primary and secondary text on the Material next-session tonal surface. The tightest checked text pair is light placeholder text on a surface at **5.70:1**. The tightest checked non-text pair is the light Open Gym calendar bar on a surface at **3.17:1**. Decorative hairlines are not used to identify controls. Run `node docs/design/prototype/gen-tokens.mjs --check` for the complete current table. These are token-pair checks, not a claim that every possible rendered combination has been audited. The thresholds come from [WCAG 2.2 text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum) and [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast).

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

## Density

*Added 23 September 2026 after owner feedback that the prototype felt too big.* One scale doesn't fit every surface, so the tokens carry two densities (`size.control`, `density.*`):

| Surface | Text | Controls | Why |
|---|---|---|---|
| Trainer Web with a mouse or trackpad | Compact: body 14/20, subhead and label 13/18, title 22/28 | 36 px (32 px in toolbars) | A calendar day or week has to fit a laptop screen. WCAG 2.2 target size (24 × 24 px) still holds. |
| Trainer Web on touch | Compact text | 48 px | Touch still needs finger-size targets. |
| iOS app | Platform text styles (Body 17 pt) with Dynamic Type | 44 pt rows and buttons (HIG) | Feels like the rest of the phone; the user's text size setting still applies. |
| Android app | Material 3 roles (bodyLarge 16/24, labelLarge 14/20) with font scaling | 48 dp targets | Matches Material 3. |
| Public booking | Touch scale | 48 px | Mostly used on a phone after a QR scan. |
| Workout logger | Large, on purpose | 64 pt/dp steppers and *Set klaar* | One hand, between sets. |

Colours and contrast pairs don't change with density. E007 maps compact density to a Tailwind/shadcn size scale on web; native apps keep native controls and only take spacing and colour from the tokens.

## Spacing, shape, and targets

- Spacing follows a 4 px scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Phone gutters start at 16; wider layouts use 24.
- Radii are 4, 8, 12, 16, 28, and full pill. iOS uses continuous corners and inset grouped lists. Material 3 maps these to its extra small through extra large shape roles.
- Interactive targets are at least 48 pt/dp in the native interpretation; the workout logger uses 64 for set controls. Web focus is a visible 2 px ring with offset. Reduced-motion preferences suppress decorative transitions.
- Safe areas, back navigation, sheets, tab bars, pickers, and destructive confirmations follow each platform's native controls in the product. The HTML prototype approximates these patterns to test flow and hierarchy. iOS uses a large title and back label; Android uses a top app bar, selected navigation indicator, and segmented buttons. [Apple colour guidance](https://developer.apple.com/design/human-interface-guidelines/color) and [Material 3 theming](https://developer.android.com/develop/ui/compose/designsystems/material3) guide the M1/M8 mapping.
- The platform difference is structural: iOS Today uses a flat large-title header, client-first inset summary, joined agenda rows and a restrained neutral pill action; Android uses a small app bar, a day overview inside content, time-first neutral tonal summary, separated elevated agenda cards and an anchored FAB. The app's add sheet is a grouped list on iOS and visual tiles on Android. Capability is identical. Phone frames appear only on sufficiently tall desktop screens; short landscape logging puts its large controls beside the scrollable values.

## Token handoff to E007

`tokens.draft.json` uses Style Dictionary v4's DTCG `$type` and `$value` format, aliases, semantic colour roles, and light/dark values in `app.trainerhub.mode` extensions. The no-dependency [prototype generator](prototype/gen-tokens.mjs) writes the checked `tokens.css` for this static prototype. E007 should move the source to `packages/design-tokens`, split light and dark theme sources as appropriate, and generate web CSS/Tailwind values plus Swift and Kotlin constants. Native mappings should feed SwiftUI semantic styles and Compose `MaterialTheme(colorScheme, typography, shapes)`; they should not replace native controls. Generated files are committed and checked for drift under ADR-015. See [Style Dictionary's DTCG support](https://styledictionary.com/info/tokens/).

Pilot feedback may change palette, type, or spacing before E007. Record findings through [`docs/discovery/prototype-validation-script.md`](../discovery/prototype-validation-script.md).

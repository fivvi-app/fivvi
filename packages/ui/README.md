# @fivvi/ui

The web component kit (ADR-015, E007): [shadcn/ui](https://ui.shadcn.com/) components on Tailwind CSS v4, themed only by the design tokens in [`@fivvi/design-tokens`](../design-tokens/README.md). The components are copied in by the shadcn CLI (style `radix-nova`), so shadcn's documentation applies as written.

| Path | What |
|---|---|
| `components.json` | shadcn configuration, as in shadcn's Next.js monorepo template |
| `src/components/` | Components from the shadcn CLI: `Button` (variants `default` = primary, `secondary`, `ghost`, `destructive`, plus upstream's `outline` and `link`), `Input`, `Label`, `Card`, `AlertDialog` (confirmation dialog), `Dialog` (a form in a modal; no built-in close button), `DropdownMenu` (a menu button with checkable rows, for the scope switcher; see the divergences), `NativeSelect` (the browser's own select, for short lists such as a role; its chevron is an inline SVG because the kit has no icon library). **The CLI's output; never edit except for the divergences below (`Dialog`, `NativeSelect`, `DropdownMenu`, `Button`)** |
| `src/kit/` | Our own building blocks of the Fivvi Pro look, written by hand: `ProCard`, `InsetList`, `PillButton`, `RoundButton`, `NextCard`, `StatusPill`, `Field`, `Toast` and `ClientLayout` ([the blocks](#the-blocks)). Imported as `@fivvi/ui/kit/<name>` |
| `src/styles/globals.css` | The stylesheet apps import: Tailwind, the token theme (trainer and client), the kit's sources, the `rounded-card`, `numeric` and `glass` utilities, the densities, shadcn's base styles and the focus indicator |
| `src/styles/palette-reset.css` | Drops Tailwind's default colour palette, so the only colours are the tokens |
| `lint/` | The raw-colour guard, run by `pnpm check` |
| `test/` | Unit tests of the stylesheet, the blocks and the guard |

## Using the kit in an app

Import the stylesheet once, in the root layout, and the components by path:

```tsx
import '@fivvi/ui/globals.css';
import { Button } from '@fivvi/ui/components/button';
```

The app needs `@tailwindcss/postcss` in its PostCSS config (see `apps/web/postcss.config.mjs`) and `@fivvi/ui` in `transpilePackages`. The page follows the system light or dark setting through the token CSS; Tailwind's `dark:` variant uses the same media query.

Style with shadcn's theme classes (`bg-primary`, `text-muted-foreground`, `border-input`, `ring-ring`) and our extras (`bg-session-private-bg`, `text-status-danger-fg`). There is nothing else: Tailwind's default palette (`bg-red-500`, `text-white`, `bg-black/50`) is removed, so such a class produces no CSS at all. The components carry no text of their own; every label comes from `packages/i18n`.

## Themes

Two themes come from the tokens in one build. Both are variables of shadcn's theme, so the same classes (`bg-card`, `text-muted-foreground`, `rounded-lg`) and the same components work in either.

| Theme | Where | Look |
|---|---|---|
| Trainer web | The default (`:root`) | shadcn's zinc neutrals with the accent; radius 12. The muted fill is `#F8F8F9`, not zinc 100, because ADR-032 fixes `#71717A` as the secondary text and it is 4.4:1 on zinc 100 |
| Fivvi Pro (client web) | Under `data-theme="client"` | The grouped grey canvas, white cards (`#1C1C1E` in dark), radius 26, secondary text `#6C6C70` (`#98989F` in dark), the glass header |

A layout opts in to the client theme with `data-theme="client"` on any element: `ClientLayout` does it for the client web, and a page with its own root layout, such as the public website, can put it on `<body>` or on its own wrapper. The attribute only sets variables, so the element that paints the canvas needs `bg-background` (the base styles give `<body>` one). Nothing switches theme at runtime: light and dark follow the system in both. A block that needs a colour the theme does not map uses a token class (`bg-status-success-bg`), never a colour of its own.

## The blocks

`src/kit/` holds the building blocks the screens share (AC14). They carry no text: labels, messages and `aria-label`s come from `packages/i18n`. Each is tested in `test/kit.test.tsx`, which also fails when a class a block uses produces no CSS (a colour outside the theme is silently dropped otherwise).

| Block | What |
|---|---|
| `ProCard` | The card: `rounded-card` (26px), the theme's card colours, 16px padding. The shadcn `Card` stays for the trainer web |
| `InsetList`, `InsetListItem` | Inset grouped list: rows in one rounded card, a hairline between them that starts 16px in |
| `PillButton`, `PillButtonStack` | Pill button: 50px high, fully rounded; variants `primary` (accent), `tonal`, `danger` (filled red, white on `#D93033`) and `ghost`; `asChild` for a link. In a stack each is full width and 48px high with 10px between |
| `RoundButton` | A round 48px control (the + button, the header's back button) with an icon; `aria-label` is required; variants `primary`, `tonal`, `glass` |
| `NextCard` | The gradient "next" card in the accent or a session type (`private`, `group`): one hue from the gradient tokens, with the on-colour text. Open Gym is not offered: no screen uses it yet |
| `StatusPill` | A status or session type: its tint with the text colour that passes on it (`neutral`, `success`, `warning`, `danger`, `private`, `group`) |
| `Field` | Label, input and hint; with an `error` the field turns red (`aria-invalid`), a warning icon and the message come under it and the input points at it (`aria-describedby`) |
| `Toast` | On the inverse of the page colours; a `warning` toast has a warning icon and is announced at once. The icon takes the text colour |
| `ClientLayout` | The client web's layout: the client theme, the touch density, a sticky glass header and a column |

Utilities from the stylesheet: `rounded-card` (the `radius.card` token), `glass` (the glass tokens, blurred; a solid fill with reduced transparency) and `numeric` (below).

## Densities

A page picks its density with a `data-density` attribute on a layout element, not a prop on each component (AC6):

| `data-density` | For | Body text | Controls (`Button`, `Input`, `NativeSelect`) |
|---|---|---|---|
| `compact` | Trainer Web on a desktop pointer | `density.compact.body`: 14/20 px | `size.control.compact`: 36 px |
| `touch` | Public and client pages | `density.touch.body`: 16/24 px | `size.control.touch`: 48 px, above the 44 px minimum touch target |

```tsx
<div data-density="compact">{children}</div>
```

`apps/web`'s root layout puts `touch` on `<body>`, so every page is touch unless a layout nested inside it, such as Trainer Web's, sets `compact`; the nearest layout wins. The density sets the body text size and line height: the size text inherits, and `text-sm`, the body size shadcn's components use (`Card`, `Button`, `Label`). Other size classes keep their size. It also sets the minimum height of the kit's controls; icon-only buttons get the same minimum width. It is a minimum, so a control can still be made larger with a class. The values come from the token CSS variables, so a token change applies without editing the kit. A new control that should follow the density gets its `data-slot` added to the density rule in `globals.css`.

## Fonts

All text uses the system stack (`font-sans`, the default); no web font is loaded. There is no `font-display` any more (Design v2, [#590](https://github.com/fivvi-app/fivvi/issues/590)). Numbers use the rounded face with tabular digits: the `numeric` utility (the token `font.family.numeric`, `ui-rounded` first, with `tabular-nums`) for times, counts and amounts; `font-numeric tabular-nums` says the same. A test fails when a source loads a web font (`test/no-web-font.test.ts`).

## Adding a component

From the repo root:

```sh
pnpm dlx shadcn@latest add <component> -c packages/ui
```

Commit the new file in `src/components/` as the CLI wrote it. `pnpm dlx shadcn@latest add <component> -c packages/ui --dry-run` reports `identical` while a file is unchanged. The CLI adds the component's npm dependencies to `package.json`; move each version into the pnpm catalog (`pnpm-workspace.yaml`) and reference it as `catalog:`. If the component uses a colour outside the theme (`text-white`, `bg-black/50`), it renders without that colour here: add a divergence below rather than bringing the palette back.

`src/components/` is excluded from Biome (`biome.json`), so its upstream formatting and imports stay as shadcn ships them, and `shadcn add --diff` shows only real upstream changes. TypeScript still checks it under the strict settings of `tsconfig.base.json`.

## Divergences from upstream

The components are the CLI's output, except for four edits (the `Dialog`, `NativeSelect`, `DropdownMenu` and `Button` rows below). Apart from those, the kit differs from a fresh `shadcn init` only in its stylesheet:

| What | Why |
|---|---|
| The theme variables come from `@fivvi/design-tokens` (`tokens.css`, `shadcn.css`, `theme.css`) instead of the `:root` and `.dark` blocks `init` writes | The tokens are the one source of colour for web, iOS and Android (ADR-015) |
| No `@custom-variant dark (&:is(.dark *))` | The app follows the system setting (`prefers-color-scheme`), as the token CSS does; there is no manual toggle |
| Tailwind's default palette is removed (`palette-reset.css`) | Only token colours exist, so every colour follows light and dark mode and the contrast checks of the token package |
| A `:focus-visible` outline in the focus colour (`--ring`), `border.width.focus` wide (2px) with a 2px offset, outside Tailwind's cascade layers | Upstream's `ring-ring/50` is about 2.4:1 against the light canvas, below the 3:1 a focus indicator needs (WCAG 2.4.7, 1.4.11). Being unlayered, the rule wins over the components' `outline-none` without editing them, and every future component gets it too. shadcn has no theme variable for the width, so the rule reads the token variable `--th-border-width-focus`, as the density rules read theirs; app code still never uses `--th-*` |
| `tw-animate-css` is imported; no `shadcn/tailwind.css` | `AlertDialog` is the first animated component. No component uses shadcn's custom variants yet: add `shadcn/tailwind.css` with the first that does |
| The `AlertDialog` overlay's upstream `bg-black/10` generates no CSS (the palette is removed), so the overlay only blurs the page (`backdrop-blur-xs`) | Accepted: upstream's 10% scrim is faint anyway, the content has `bg-popover` plus a ring, and there is no web scrim design token. `alert-dialog.tsx` stays the CLI output |
| `Dialog` has no close button (upstream's `showCloseButton`, an `XIcon` from `lucide-react` and a hard-coded "Close", also in the footer). **`dialog.tsx` is edited** | The kit has no icon library and carries no text of its own; a dialog has a cancel button with a translated label and closes on Escape |
| The `Dialog` overlay's upstream `bg-black/10` generates no CSS either (the palette is removed), so the overlay only blurs the page (`backdrop-blur-xs`) | Accepted for the same reasons as the `AlertDialog` overlay above |
| `NativeSelect` draws its chevron as an inline SVG instead of upstream's `ChevronDownIcon` from `lucide-react`. **`native-select.tsx` is edited** | The kit has no icon library |
| `DropdownMenu` is a reduced version of upstream's: the menu, trigger, content, group, item, radio group, radio item and separator only (the rest joins when a feature needs it), and the radio item's check is an inline SVG instead of upstream's `CheckIcon` from `lucide-react`. **`dropdown-menu.tsx` is written by hand** | The kit has no icon library, and only the parts the scope switcher (F012) uses are in it |
| The `destructive` `Button` tints are 10% and hover 15% (dark 15% and 20%), not upstream's 10/20 and 20/30. **`button.tsx` is edited** | The destructive text on its own tint must keep 4.5:1 on every web background, hover included; a test in `packages/design-tokens` reads these numbers |
| Density rules for `[data-density]` (`compact`, `touch`) in Tailwind's `base` layer, which also set `--text-sm` inside the layout | shadcn has one size scale; the densities set body text and a minimum control size per layout from the tokens, without editing the components ([densities](#densities)) |
| No `src/lib/utils.ts` | The `radix-nova` components import `cn` from the `cn` package directly |

## Raw-colour guard

`pnpm check` (this package's `check` task, `node lint/cli.ts`) fails when web source holds a raw colour, and names the file, line and column. It scans `apps/web` and `packages/ui` and rejects:

- hex colours (`#fff`, `#ffffff80`), and `rgb()`, `rgba()`, `hsl()`, `hsla()`, `hwb()`, `lab()`, `lch()`, `oklab()`, `oklch()` and `color(<colour space> …)`;
- arbitrary Tailwind colour values: a literal, a named colour or a `color-mix()` in brackets (`bg-[#fff]`, `text-[rgb(0_0_0)]`, `border-[red]`, `hover:bg-[color-mix(…)]`).

Use the theme classes or variables instead (`bg-primary`, `var(--primary)`). An arbitrary value that only references a variable (`bg-(--primary)`) is not a raw colour. Comments are ignored, so `#123` as an issue reference is fine.

It leaves alone, on purpose:

| What | Why |
|---|---|
| `src/components/` | Vendored shadcn components, edited only where the divergences above say so (`Dialog`, `NativeSelect`, `DropdownMenu`, `Button`). Upstream's secondary `Button` uses `hover:bg-[color-mix(…)]`. The directory is where `components.json`'s `ui` alias resolves; a test keeps the two in step |
| Tests (`*.test.*`, `*.spec.*`, and a package's top-level `test/` and `e2e/`) | They assert on colours, such as a token's computed `rgb()`, rather than paint with them |
| `node_modules/`, hidden directories (`.next/`), and a package's top-level build output (`dist/`, `out/`, …) | Not source |

The generated token files live in `packages/design-tokens`, outside the guard's scope. `turbo.json` adds `apps/web` to the task's inputs, so turbo re-runs the guard when web files change.

## Checks

`pnpm --filter @fivvi/ui typecheck`, `lint`, `test` and `check` (the raw-colour guard); `scripts/check.sh` and CI run them through turbo. The rendered result is tested in `apps/web/e2e/theme.spec.ts`: token colours and axe in light and dark (AC5), the densities (AC6), the focus indicator on `Button` and `Input` (AC7), no web font and the system stack (E020 AC12), the rounded numbers (AC11) and the two themes (AC13).

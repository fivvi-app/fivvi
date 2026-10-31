# @fivvi/ui

The web component kit (ADR-015, E007): [shadcn/ui](https://ui.shadcn.com/) components on Tailwind CSS v4, themed only by the design tokens in [`@fivvi/design-tokens`](../design-tokens/README.md). The components are copied in by the shadcn CLI (style `radix-nova`), so shadcn's documentation applies as written.

| Path | What |
|---|---|
| `components.json` | shadcn configuration, as in shadcn's Next.js monorepo template |
| `src/components/` | Components from the shadcn CLI: `Button` (variants `default` = primary, `secondary`, `ghost`, `destructive`, plus upstream's `outline` and `link`), `Input`, `Label`, `Card`, `AlertDialog` (confirmation dialog), `NativeSelect` (the browser's own select, for short lists such as a role; its chevron is an inline SVG because the kit has no icon library). **Upstream code, never edit** |
| `src/styles/globals.css` | The stylesheet apps import: Tailwind, the token theme, the kit's sources, the densities, shadcn's base styles and the focus indicator |
| `src/styles/palette-reset.css` | Drops Tailwind's default colour palette, so the only colours are the tokens |
| `lint/` | The raw-colour guard, run by `pnpm check` |
| `test/` | Unit tests of the stylesheet and the guard |

## Using the kit in an app

Import the stylesheet once, in the root layout, and the components by path:

```tsx
import '@fivvi/ui/globals.css';
import { Button } from '@fivvi/ui/components/button';
```

The app needs `@tailwindcss/postcss` in its PostCSS config (see `apps/web/postcss.config.mjs`) and `@fivvi/ui` in `transpilePackages`. The page follows the system light or dark setting through the token CSS; Tailwind's `dark:` variant uses the same media query.

Style with shadcn's theme classes (`bg-primary`, `text-muted-foreground`, `border-input`, `ring-ring`) and our extras (`bg-session-private-bg`, `text-status-danger-fg`). There is nothing else: Tailwind's default palette (`bg-red-500`, `text-white`, `bg-black/50`) is removed, so such a class produces no CSS at all. The components carry no text of their own; every label comes from `packages/i18n`.

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

## Display font

`font-display` sets the display style's font, `font.family.display`: Bricolage Grotesque, then the system font. Use it sparingly for headings on public pages and brand moments, never for body text or form labels ([visual direction](../../docs/design/visual-direction.md)). Body text uses the system font (`font-sans`, the default).

The app self-hosts the face: `apps/web/app/display-font.ts` loads it with `next/font/google`, which downloads it at build time and serves it from the app's own origin, so no request goes to a font host at runtime. next/font names the face after the font, so it matches the first family of the token stack. Don't use next/font's `className` or `variable` for it: they put next/font's metric-adjusted Arial in front of the system fallback.

## Adding a component

From the repo root:

```sh
pnpm dlx shadcn@latest add <component> -c packages/ui
```

Commit the new file in `src/components/` as the CLI wrote it. `pnpm dlx shadcn@latest add <component> -c packages/ui --dry-run` reports `identical` while a file is unchanged. The CLI adds the component's npm dependencies to `package.json`; move each version into the pnpm catalog (`pnpm-workspace.yaml`) and reference it as `catalog:`. If the component uses a colour outside the theme (`text-white`, `bg-black/50`), it renders without that colour here: add a divergence below rather than bringing the palette back.

`src/components/` is excluded from Biome (`biome.json`), so its upstream formatting and imports stay as shadcn ships them, and `shadcn add --diff` shows only real upstream changes. TypeScript still checks it under the strict settings of `tsconfig.base.json`.

## Divergences from upstream

The components themselves are unchanged. The kit differs from a fresh `shadcn init` only in its stylesheet:

| What | Why |
|---|---|
| The theme variables come from `@fivvi/design-tokens` (`tokens.css`, `shadcn.css`, `theme.css`) instead of the `:root` and `.dark` blocks `init` writes | The tokens are the one source of colour for web, iOS and Android (ADR-015) |
| No `@custom-variant dark (&:is(.dark *))` | The app follows the system setting (`prefers-color-scheme`), as the token CSS does; there is no manual toggle |
| Tailwind's default palette is removed (`palette-reset.css`) | Only token colours exist, so every colour follows light and dark mode and the contrast checks of the token package |
| A `:focus-visible` outline in the focus colour (`--ring`), `border.width.focus` wide (2px) with a 2px offset, outside Tailwind's cascade layers | Upstream's `ring-ring/50` is about 2.4:1 against the light canvas, below the 3:1 a focus indicator needs (WCAG 2.4.7, 1.4.11). Being unlayered, the rule wins over the components' `outline-none` without editing them, and every future component gets it too. shadcn has no theme variable for the width, so the rule reads the token variable `--th-border-width-focus`, as the density rules read theirs; app code still never uses `--th-*` |
| `tw-animate-css` is imported; no `shadcn/tailwind.css` | `AlertDialog` is the first animated component. No component uses shadcn's custom variants yet: add `shadcn/tailwind.css` with the first that does |
| The `AlertDialog` overlay's upstream `bg-black/10` generates no CSS (the palette is removed), so the overlay only blurs the page (`backdrop-blur-xs`) | Accepted: upstream's 10% scrim is faint anyway, the content has `bg-popover` plus a ring, and there is no web scrim design token. `alert-dialog.tsx` stays the CLI output |
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
| `src/components/` | Vendored shadcn components, never edited. Upstream's secondary `Button` uses `hover:bg-[color-mix(…)]`. The directory is where `components.json`'s `ui` alias resolves; a test keeps the two in step |
| Tests (`*.test.*`, `*.spec.*`, and a package's top-level `test/` and `e2e/`) | They assert on colours, such as a token's computed `rgb()`, rather than paint with them |
| `node_modules/`, hidden directories (`.next/`), and a package's top-level build output (`dist/`, `out/`, …) | Not source |

The generated token files live in `packages/design-tokens`, outside the guard's scope. `turbo.json` adds `apps/web` to the task's inputs, so turbo re-runs the guard when web files change.

## Checks

`pnpm --filter @fivvi/ui typecheck`, `lint`, `test` and `check` (the raw-colour guard); `scripts/check.sh` and CI run them through turbo. The rendered result is tested in `apps/web/e2e/theme.spec.ts`: token colours and axe in light and dark (AC5), the densities (AC6), the focus indicator on `Button` and `Input` (AC7) and the self-hosted display font (AC9).

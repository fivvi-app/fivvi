# @trainer-hub/ui

The web component kit (ADR-015, E007): [shadcn/ui](https://ui.shadcn.com/) components on Tailwind CSS v4, themed only by the design tokens in [`@trainer-hub/design-tokens`](../design-tokens/README.md). The components are copied in by the shadcn CLI (style `radix-nova`), so shadcn's documentation applies as written.

| Path | What |
|---|---|
| `components.json` | shadcn configuration, as in shadcn's Next.js monorepo template |
| `src/components/` | Components from the shadcn CLI: `Button` (variants `default` = primary, `secondary`, `ghost`, `destructive`, plus upstream's `outline` and `link`), `Input`, `Label`, `Card`. **Upstream code, never edit** |
| `src/styles/globals.css` | The stylesheet apps import: Tailwind, the token theme, the kit's sources, shadcn's base styles and the focus indicator |
| `src/styles/palette-reset.css` | Drops Tailwind's default colour palette, so the only colours are the tokens |
| `test/` | Unit tests of the stylesheet |

## Using the kit in an app

Import the stylesheet once, in the root layout, and the components by path:

```tsx
import '@trainer-hub/ui/globals.css';
import { Button } from '@trainer-hub/ui/components/button';
```

The app needs `@tailwindcss/postcss` in its PostCSS config (see `apps/web/postcss.config.mjs`) and `@trainer-hub/ui` in `transpilePackages`. The page follows the system light or dark setting through the token CSS; Tailwind's `dark:` variant uses the same media query.

Style with shadcn's theme classes (`bg-primary`, `text-muted-foreground`, `border-input`, `ring-ring`) and our extras (`bg-session-private-bg`, `text-status-danger-fg`). There is nothing else: Tailwind's default palette (`bg-red-500`, `text-white`, `bg-black/50`) is removed, so such a class produces no CSS at all. The components carry no text of their own; every label comes from `packages/i18n`.

## Adding a component

From the repo root:

```sh
pnpm dlx shadcn@latest add <component> -c packages/ui
```

Commit the new file in `src/components/` as the CLI wrote it. The CLI adds the component's npm dependencies to `package.json`; move each version into the pnpm catalog (`pnpm-workspace.yaml`) and reference it as `catalog:`. If the component uses a colour outside the theme (`text-white`, `bg-black/50`), it renders without that colour here: add a divergence below rather than bringing the palette back.

`src/components/` is excluded from Biome (`biome.json`), so its upstream formatting and imports stay as shadcn ships them, and `shadcn add --diff` shows only real upstream changes. TypeScript still checks it under the strict settings of `tsconfig.base.json`.

## Divergences from upstream

The components themselves are unchanged. The kit differs from a fresh `shadcn init` only in its stylesheet:

| What | Why |
|---|---|
| The theme variables come from `@trainer-hub/design-tokens` (`tokens.css`, `shadcn.css`, `theme.css`) instead of the `:root` and `.dark` blocks `init` writes | The tokens are the one source of colour for web, iOS and Android (ADR-015) |
| No `@custom-variant dark (&:is(.dark *))` | The app follows the system setting (`prefers-color-scheme`), as the token CSS does; there is no manual toggle |
| Tailwind's default palette is removed (`palette-reset.css`) | Only token colours exist, so every colour follows light and dark mode and the contrast checks of the token package |
| A `:focus-visible` outline in the focus colour (`--ring`, 2px, 2px offset) outside Tailwind's cascade layers | Upstream's `ring-ring/50` is about 2.4:1 against the light canvas, below the 3:1 a focus indicator needs (WCAG 2.4.7, 1.4.11). Being unlayered, the rule wins over the components' `outline-none` without editing them, and every future component gets it too |
| No `tw-animate-css` or `shadcn/tailwind.css` | None of the current components animate or use shadcn's custom variants. Add them with the first component that does |
| No `src/lib/utils.ts` | The `radix-nova` components import `cn` from the `cn` package directly |

## Checks

`pnpm --filter @trainer-hub/ui typecheck`, `lint` and `test`; `scripts/check.sh` and CI run them through turbo. The rendered result is tested in `apps/web/e2e/theme.spec.ts`: token colours and axe in light and dark (AC5), and the focus indicator on `Button` and `Input` (AC7).

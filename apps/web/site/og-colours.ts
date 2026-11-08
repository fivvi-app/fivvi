import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The colours of a share image (F064 AC12), read from the design tokens' generated stylesheet.
 * An image is drawn outside the page, where a CSS variable means nothing, so it needs the values
 * themselves; reading them here keeps them in the one source (`packages/design-tokens`) instead of
 * copying them. The first block of the file is the light mode. Runs at build time only, from
 * `apps/web`, where the images are made.
 */
const tokensFile = path.resolve(
  process.cwd(),
  '../../packages/design-tokens/generated/web/tokens.css',
);

export const ogColourTokens = {
  canvas: '--th-color-bg-canvas',
  surface: '--th-color-bg-surface',
  text: '--th-color-text-primary',
  secondary: '--th-color-web-client-secondary',
  accent: '--th-color-accent-fill',
  accentText: '--th-color-accent-text',
} as const;

export type OgColours = Record<keyof typeof ogColourTokens, string>;

/** The light-mode value of each token, as `#rrggbb`. Throws when the stylesheet lacks one. */
export function readOgColours(css: string = readFileSync(tokensFile, 'utf8')): OgColours {
  const entries = Object.entries(ogColourTokens).map(([name, token]) => {
    const value = new RegExp(`${token}:\\s*(#[\\da-f]{6})\\s*;`, 'i').exec(css)?.[1];
    if (!value) throw new Error(`The design tokens have no ${token}`);
    return [name, value] as const;
  });
  return Object.fromEntries(entries) as OgColours;
}

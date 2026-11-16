import type { MetadataRoute } from 'next';
import { readOgColours } from '../site/og-colours';

// Built with the build: the colours are read from the design tokens' generated stylesheet, which
// only exists where the app is built (like the share images, `site/og-colours.ts`).
export const dynamic = 'force-static';

/**
 * The web app manifest (F013 AC9, `/manifest.webmanifest`): Fivvi can be added to a phone's home
 * screen. It opens at `/home`, which sends each person to their home, a Trainer's *Mijn dag*. The
 * icons are the day dial B2 of `docs/design/brand/favicon.svg`, made by `scripts/brand-icons.ts`:
 * `app/icon.png` (192 px) and two 512 px files, one of them maskable. The name is the brand's, so
 * it needs no translation. The colours are the canvas of the design tokens.
 */
export default function manifest(): MetadataRoute.Manifest {
  const { canvas } = readOgColours();
  return {
    name: 'Fivvi',
    short_name: 'Fivvi',
    start_url: '/home',
    scope: '/',
    display: 'standalone',
    background_color: canvas,
    theme_color: canvas,
    icons: [
      { src: '/icon.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      {
        src: '/site-images/brand/app-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/site-images/brand/app-icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}

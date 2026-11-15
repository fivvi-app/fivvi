import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isPublicPath } from '../server/route-guard';
import { readOgColours } from '../site/og-colours';
import manifest, { dynamic } from './manifest';

// F013 AC9: the web app manifest, so a trainer can add Fivvi to the phone's home screen. Its icons
// are the day dial of `docs/design/brand/favicon.svg` (made by `scripts/brand-icons.ts`, whose own
// test fails when a committed file differs from what the script makes).
const webRoot = path.resolve(import.meta.dirname, '..');
const served = (src: string) =>
  [
    path.join(webRoot, 'public', src),
    path.join(webRoot, 'app', src.replace(/^\/(.*)\.png$/, '$1.png')),
  ].find(existsSync);
const pngSize = (file: string) => {
  const png = readFileSync(file);
  return `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`;
};

describe('F013 AC9 the web app manifest', () => {
  it('is built once, with the build, from the design tokens', () => {
    expect(dynamic).toBe('force-static');
  });

  it('names the app, opens at the signed-in home (which sends a Trainer to Mijn dag) and runs like an app', () => {
    expect(manifest()).toMatchObject({
      name: 'Fivvi',
      short_name: 'Fivvi',
      start_url: '/home',
      scope: '/',
      display: 'standalone',
    });
  });

  it('takes its colours from the design tokens: the canvas', () => {
    const { canvas } = readOgColours();

    expect(manifest()).toMatchObject({ background_color: canvas, theme_color: canvas });
  });

  it('has the day dial as 192 and 512 px icons and a maskable one, each a file of that size', () => {
    const icons = manifest().icons ?? [];

    expect(icons.map(({ src, sizes, type, purpose }) => [src, sizes, type, purpose])).toEqual([
      ['/icon.png', '192x192', 'image/png', 'any'],
      ['/site-images/brand/app-icon-512.png', '512x512', 'image/png', 'any'],
      ['/site-images/brand/app-icon-maskable-512.png', '512x512', 'image/png', 'maskable'],
    ]);
    for (const { src, sizes } of icons) {
      const file = served(src);
      expect(file, `${src} is a file`).toBeDefined();
      expect(pngSize(file as string)).toBe(sizes);
    }
  });

  it('is fetched without a session, as a browser does, and so are its icons', () => {
    expect(isPublicPath('/manifest.webmanifest')).toBe(true);
    for (const { src } of manifest().icons ?? []) expect(isPublicPath(src), src).toBe(true);
  });
});

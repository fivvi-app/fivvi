import { readFileSync } from 'node:fs';
import path from 'node:path';
import { clientIpHeaders } from './accounts';
import { expect, test } from './fixtures';

// F013 AC9: the web app manifest is served, without a sign-in, and its icons are the day-dial
// files that `scripts/brand-icons.ts` makes from `docs/design/brand/favicon.svg` (its own test
// fails when a committed file differs from what the script makes). Not about a language.
const webRoot = path.resolve(import.meta.dirname, '..');
const file = (...parts: string[]) => readFileSync(path.join(webRoot, ...parts));

interface Manifest {
  name: string;
  start_url: string;
  display: string;
  icons: { src: string; sizes: string; type: string; purpose: string }[];
}

test.describe('F013 AC9 the web app manifest', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
  });

  test('AC9: is served to anyone, and every page links to it', async ({ page, request }) => {
    const response = await request.get('/manifest.webmanifest', { maxRedirects: 0 });

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('manifest+json');
    const manifest = (await response.json()) as Manifest;
    expect(manifest).toMatchObject({ name: 'Fivvi', start_url: '/home', display: 'standalone' });

    await page.goto('/login');
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      'href',
      '/manifest.webmanifest',
    );
  });

  test('AC9: its icons are the day dial made from favicon.svg, served without a sign-in', async ({
    request,
  }) => {
    const manifest = (await (await request.get('/manifest.webmanifest')).json()) as Manifest;
    const onDisk: Record<string, Buffer> = {
      '/icon.png': file('app', 'icon.png'),
      '/site-images/brand/app-icon-512.png': file(
        'public',
        'site-images',
        'brand',
        'app-icon-512.png',
      ),
      '/site-images/brand/app-icon-maskable-512.png': file(
        'public',
        'site-images',
        'brand',
        'app-icon-maskable-512.png',
      ),
    };

    expect(manifest.icons.map(({ src }) => src).sort()).toEqual(Object.keys(onDisk).sort());
    for (const icon of manifest.icons) {
      const served = await request.get(icon.src, { maxRedirects: 0 });
      expect(served.status(), icon.src).toBe(200);
      expect(served.headers()['content-type'], icon.src).toBe(icon.type);
      expect(
        (await served.body()).equals(onDisk[icon.src] as Buffer),
        `${icon.src} is the file`,
      ).toBe(true);
    }
    expect(manifest.icons.some(({ purpose }) => purpose === 'maskable')).toBe(true);
  });
});

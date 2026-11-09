import { builtPages, type SitePage, sitePagePath, unlistedPages } from '../site/routes';
import { expect, test } from './fixtures';

// F064 (#669): the Fivvi wordmark in the header and footer of every site page, and the favicon
// files of the site and the app. Words come from the catalog, never typed here (TESTING.md §5.4).
const PAGES: readonly SitePage[] = [...builtPages, ...unlistedPages];
const SCHEMES = ['light', 'dark'] as const;

test.describe('F064 #669 the wordmark on every site page', () => {
  for (const page of PAGES) {
    test(`${page}: header and footer link to the home page, in light and dark`, async ({
      page: tab,
      appLocale,
      messages,
    }) => {
      const home = sitePagePath('home', appLocale);
      const name = messages.site.logo.homeLabel;
      await tab.goto(sitePagePath(page, appLocale));

      for (const [region, landmark] of [
        ['header', tab.getByRole('banner')],
        ['footer', tab.getByRole('contentinfo')],
      ] as const) {
        const link = landmark.getByRole('link', { name, exact: true });
        await expect(link, `${region} logo link`).toHaveCount(1);
        await expect(link).toHaveAttribute('href', home);

        const image = link.getByRole('img', { name, exact: true });
        const [width, height] = await image.evaluate((element) => {
          const { width: w, height: h } = element.getBoundingClientRect();
          return [w, h];
        });
        expect(height, `${region} logo height`).toBeGreaterThanOrEqual(20);
        expect(width).toBeGreaterThan(0);
        // Width and height are set in the markup, so the page does not shift when it loads.
        await expect(image).toHaveAttribute('width', /^\d+$/);
        await expect(image).toHaveAttribute('height', /^\d+$/);

        for (const [scheme, file] of [
          ['light', 'fivvi-logo.svg'],
          ['dark', 'fivvi-logo-dark.svg'],
        ] as const) {
          await tab.emulateMedia({ colorScheme: scheme });
          await expect
            .poll(() => image.evaluate((element) => (element as HTMLImageElement).currentSrc), {
              message: `${region} logo in ${scheme} mode`,
            })
            .toContain(`/site-images/brand/${file}`);
          await expect(image).toHaveJSProperty('complete', true);
          expect(
            await image.evaluate((element) => (element as HTMLImageElement).naturalWidth),
          ).toBeGreaterThan(0);
        }
      }
    });
  }

  for (const scheme of SCHEMES) {
    test(`the wordmark does not move the page when it arrives, in ${scheme} mode`, async ({
      page,
      appLocale,
      messages,
    }) => {
      // The wordmark is held back while the page is laid out, then let through: whatever moves when
      // it arrives (a header that grows, a menu pushed aside) is a layout shift.
      let release: () => void = () => {};
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route('**/site-images/brand/*.svg', async (route) => {
        await held;
        await route.continue();
      });
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(sitePagePath('home', appLocale), { waitUntil: 'domcontentloaded' });
      const header = page.getByRole('banner');
      const logo = header.getByRole('img').first();
      const footer = page.getByRole('contentinfo');
      const home = { name: messages.site.logo.homeLabel };
      const layout = async () => ({
        // The space the logo takes: without width and height it is the link's padding alone.
        headerLogo: await header.getByRole('link', home).boundingBox(),
        footerLogo: await footer.getByRole('link', home).boundingBox(),
        header: await header.boundingBox(),
        navigation: await header
          .getByRole('navigation', { name: messages.site.header.menuLabel })
          .boundingBox(),
        main: await page.locator('main').boundingBox(),
      });

      const before = await layout();
      expect(await logo.evaluate((element) => (element as HTMLImageElement).complete)).toBe(false);
      // The space is there before the image is: at least the logo's height, besides its padding.
      for (const logo of [before.headerLogo, before.footerLogo]) {
        expect(logo?.height).toBeGreaterThanOrEqual(20);
        expect(logo?.width).toBeGreaterThan(20);
      }
      release();
      await expect(logo).toHaveJSProperty('complete', true);

      expect(await layout()).toEqual(before);
    });
  }
});

test.describe('F064 #669 the favicon of the site and the app', () => {
  const icons = [
    ['/favicon.ico', 'image/x-icon'],
    ['/icon.svg', 'image/svg+xml'],
    ['/icon.png', 'image/png'],
    ['/apple-icon.png', 'image/png'],
  ] as const;

  for (const [file, type] of icons) {
    test(`${file} is served to anyone, as ${type}`, async ({ request }) => {
      const response = await request.get(file, { maxRedirects: 0 });

      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toContain(type);
      expect((await response.body()).length).toBeGreaterThan(0);
    });
  }

  for (const [name, address] of [
    ['a site page', (locale: 'nl-NL' | 'en') => sitePagePath('home', locale)],
    ['the sign-in page', () => '/login'],
  ] as const) {
    test(`${name} points to the favicon files and the apple-touch-icon`, async ({
      page,
      appLocale,
    }) => {
      await page.goto(address(appLocale));

      const hrefs = async (selector: string) =>
        page
          .locator(`head link[${selector}]`)
          .evaluateAll((links) =>
            links.map((link) => new URL((link as HTMLLinkElement).href).pathname),
          );
      expect(await hrefs('rel="icon"')).toEqual(
        expect.arrayContaining(['/icon.svg', '/favicon.ico']),
      );
      expect(await hrefs('rel="apple-touch-icon"')).toEqual(['/apple-icon.png']);
    });
  }
});

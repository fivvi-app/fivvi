import { type Locale, locales, messages } from '@fivvi/i18n';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { isImageOrPrefetch } from './site-requests';

// F064 AC2, the four audience pages (#639): their problems and working day with real screens, and
// the Studios page's switch between pilates and yoga. Both languages are visited by every
// project. Copy comes from the catalogs (TESTING.md §5.4).
const SHOT_LANGUAGE: Record<Locale, string> = { 'nl-NL': 'nl', en: 'en' };
const PAGES = {
  gyms: { 'nl-NL': '/sportscholen', en: '/en/gyms' },
  studios: { 'nl-NL': '/studios', en: '/en/studios' },
  personalTrainers: { 'nl-NL': '/personal-trainers', en: '/en/personal-trainers' },
  clients: { 'nl-NL': '/klanten', en: '/en/clients' },
} as const;
type PageId = keyof typeof PAGES;
const PAGE_IDS = Object.keys(PAGES) as PageId[];

async function scrollThrough(page: Page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
  });
}

for (const locale of locales) {
  const site = messages[locale].site;
  const screens = site.home.screens;
  const studios = site.audience.studios;

  test.describe(`F064 AC2 the Studios switch in ${locale}`, () => {
    test('goes from pilates to yoga: the miniature, the screens and the word for the trainer change, and no request leaves the page', async ({
      page,
    }) => {
      await page.goto(PAGES.studios[locale]);
      const requests: string[] = [];
      page.on('request', (request) => {
        if (!isImageOrPrefetch(request)) requests.push(request.url());
      });
      const button = (kind: 'pilates' | 'yoga') =>
        page.getByRole('button', { name: studios.kind[kind], exact: true });
      const question = (kind: 'pilates' | 'yoga') =>
        studios.moments.substitute.question.replace('{who}', studios.words[kind].who);

      await expect(button('pilates')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByText(question('pilates'))).toBeVisible();
      await expect(page.getByText(question('yoga'))).toBeHidden();
      await expect(
        page.getByRole('img', { name: screens.webClassPilates, exact: true }).first(),
      ).toBeVisible();

      await button('yoga').click();

      await expect(button('yoga')).toHaveAttribute('aria-pressed', 'true');
      await expect(button('pilates')).toHaveAttribute('aria-pressed', 'false');
      await expect(page.getByText(question('yoga'))).toBeVisible();
      await expect(page.getByText(question('pilates'))).toBeHidden();
      await expect(page.locator('main img[srcset*="/scenes/"]:visible').first()).toHaveAttribute(
        'srcset',
        /\/scenes\/yoga-400/,
      );
      for (const name of [screens.webClassYoga, screens.proTodayYoga]) {
        await expect(page.getByRole('img', { name, exact: true }).first()).toBeVisible();
      }
      await expect(
        page.getByRole('img', { name: screens.webClassPilates, exact: true }),
      ).toBeHidden();
      // Yoga has its own A4 poster.
      await page
        .getByRole('img', { name: screens.webJoinYoga, exact: true })
        .first()
        .scrollIntoViewIfNeeded();
      await expect(
        page.getByRole('img', { name: screens.webJoinYoga, exact: true }).first(),
      ).toBeVisible();

      await button('pilates').click();
      await expect(page.getByText(question('pilates'))).toBeVisible();
      expect(requests).toEqual([]);
    });

    for (const colorScheme of ['light', 'dark'] as const) {
      test(`the chosen kind is a white pill with black text in ${colorScheme} mode`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme });
        await page.goto(PAGES.studios[locale]);
        const chosen = page.getByRole('button', { name: studios.kind.pilates, exact: true });

        const { background, text } = await chosen.evaluate((element) => ({
          background: getComputedStyle(element).backgroundColor,
          text: getComputedStyle(element).color,
        }));
        if (colorScheme === 'dark') {
          expect(background).toBe('rgb(255, 255, 255)');
          expect(text).toBe('rgb(0, 0, 0)');
        } else {
          expect(background).not.toBe('rgba(0, 0, 0, 0)');
        }
      });
    }

    test('requests no yoga image until yoga is chosen', async ({ page }) => {
      const yoga: string[] = [];
      page.on('request', (request) => {
        if (request.resourceType() === 'image' && /yoga/.test(new URL(request.url()).pathname)) {
          yoga.push(request.url());
        }
      });

      await page.goto(PAGES.studios[locale]);
      await scrollThrough(page);
      expect(yoga).toEqual([]);

      await page.getByRole('button', { name: studios.kind.yoga, exact: true }).click();
      await scrollThrough(page);
      await expect.poll(() => yoga.length).toBeGreaterThan(0);
      expect(yoga.some((url) => url.includes('/scenes/yoga-'))).toBe(true);
      expect(yoga.some((url) => url.includes('/shots/web-class-yoga-'))).toBe(true);
    });

    test('has both kinds in the HTML without JavaScript, yoga hidden', async ({
      browser,
      baseURL,
    }) => {
      const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
      const page = await context.newPage();

      await page.goto(PAGES.studios[locale]);

      const yoga = studios.moments.substitute.question.replace('{who}', studios.words.yoga.who);
      await expect(
        page.getByText(
          studios.moments.substitute.question.replace('{who}', studios.words.pilates.who),
        ),
      ).toBeVisible();
      await expect(page.getByText(yoga)).toBeHidden();
      expect(await page.locator('[hidden]').allTextContents()).toEqual(
        expect.arrayContaining([expect.stringContaining(yoga)]),
      );
      await context.close();
    });
  });

  test.describe(`F064 AC2 the audience pages in ${locale}`, () => {
    for (const id of PAGE_IDS) {
      for (const colorScheme of ['light', 'dark'] as const) {
        test(`${id}: every shown image loads, in the page's language, in ${colorScheme} mode`, async ({
          page,
        }) => {
          await page.emulateMedia({ colorScheme });
          await page.goto(PAGES[id][locale]);
          await scrollThrough(page);

          const images = await page.locator('main img').evaluateAll((elements) =>
            (elements as HTMLImageElement[])
              .filter((image) => image.checkVisibility())
              .map((image) => ({
                src: image.currentSrc,
                loaded: image.complete && image.naturalWidth > 0,
              })),
          );
          expect(images.filter(({ loaded }) => !loaded)).toEqual([]);
          const shown = images.filter(({ src }) => src.includes('/shots/'));
          expect(shown.length).toBeGreaterThan(5);
          for (const { src } of shown) {
            expect(src).toContain(`-${SHOT_LANGUAGE[locale]}-${colorScheme}-`);
          }
        });
      }

      test(`${id}: the miniature stands on its own, beside the headline and clear of every screen`, async ({
        page,
      }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto(PAGES[id][locale]);

        const scene = page.locator('main img[srcset*="/scenes/"]:visible').first();
        await expect(scene).toBeVisible();
        const sceneBox = await scene.boundingBox();
        const headline = await page.getByRole('heading', { level: 1 }).boundingBox();
        expect(sceneBox).not.toBeNull();
        expect(headline).not.toBeNull();
        // Beside the headline: right of it on a wide screen, and not over it.
        expect((sceneBox?.x ?? 0) + 4).toBeGreaterThan(
          (headline?.x ?? 0) + (headline?.width ?? 0) - 40,
        );
        const boxes = await page
          .locator('main img[src*="/shots/"]:visible')
          .evaluateAll((elements) =>
            elements.map((element) => {
              const { x, y, width, height } = element.getBoundingClientRect();
              return { x, y: y + window.scrollY, width, height };
            }),
          );
        const own = await scene.evaluate((element) => {
          const { x, y, width, height } = element.getBoundingClientRect();
          return { x, y: y + window.scrollY, width, height };
        });
        for (const box of boxes) {
          const overlaps =
            own.x < box.x + box.width &&
            box.x < own.x + own.width &&
            own.y < box.y + box.height &&
            box.y < own.y + own.height;
          expect(overlaps).toBe(false);
        }
      });
    }

    test('gyms: the laptop and the phone share one top edge and one bottom edge', async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(PAGES.gyms[locale]);

      const stage = page.locator('.site-stage');
      await expect(stage.getByRole('img', { name: screens.webAgenda, exact: true })).toBeVisible();
      const { l, p } = await stage.evaluate(
        (element, names) => {
          const box = (name: string) => {
            const image = [...element.querySelectorAll('img')].find((img) => img.alt === name);
            if (!image) throw new Error(`No screen named ${name}`);
            const { y, height } = image.getBoundingClientRect();
            return { y, height };
          };
          return { l: box(names.laptop), p: box(names.phone) };
        },
        { laptop: screens.webAgenda, phone: screens.proTodayGym },
      );
      expect(Math.abs(l.y - p.y)).toBeLessThanOrEqual(8);
      expect(Math.abs(l.y + l.height - (p.y + p.height))).toBeLessThanOrEqual(8);
    });

    for (const id of ['personalTrainers', 'clients'] as const) {
      test(`${id}: three phones of one size on one line`, async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto(PAGES[id][locale]);

        const phones = await page.locator('.site-stage .site-phone').evaluateAll((elements) =>
          elements.map((element) => {
            const { y, width, height } = element.getBoundingClientRect();
            return { y, width, height };
          }),
        );
        expect(phones).toHaveLength(3);
        for (const phone of phones) {
          expect(Math.abs(phone.y - (phones[0]?.y ?? 0))).toBeLessThanOrEqual(1);
          expect(Math.abs(phone.width - (phones[0]?.width ?? 0))).toBeLessThanOrEqual(1);
          expect(Math.abs(phone.height - (phones[0]?.height ?? 0))).toBeLessThanOrEqual(1);
        }
      });
    }

    test('a web moment has a wider screen column than a phone moment', async ({ page }) => {
      await page.goto(PAGES.gyms[locale]);

      const widths = await page.locator('article').evaluateAll((elements) =>
        elements.map((element) => ({
          web: element.hasAttribute('data-wide'),
          screenColumn: (element.lastElementChild as HTMLElement).getBoundingClientRect().width,
        })),
      );
      const web = widths.filter(({ web: isWeb }) => isWeb);
      const phone = widths.filter(({ web: isWeb }) => !isWeb);
      expect(web.length).toBeGreaterThan(0);
      expect(phone.length).toBeGreaterThan(0);
      for (const card of web)
        expect(card.screenColumn).toBeGreaterThan(phone[0]?.screenColumn ?? 0);
    });
  });
}

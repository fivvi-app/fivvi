import { type Locale, locales, messages } from '@fivvi/i18n';
import { expect, test } from './fixtures';

// F064, the home page (#638): the *I am* switch, the real screens, the sample booking. Both
// languages are visited by every project, so a page never depends on the browser's language.
// Copy comes from the catalogs (TESTING.md §5.4).
const HOME: Record<Locale, string> = { 'nl-NL': '/', en: '/en' };
const SHOT_LANGUAGE: Record<Locale, string> = { 'nl-NL': 'nl', en: 'en' };

type Audience = 'gym' | 'studio' | 'pt' | 'client';
type ScreenKey = keyof (typeof messages)['en']['site']['home']['screens'];
/** The screens each audience shows under the switch (`site/home/audiences.ts`). */
const STAGES: Record<Audience, { scene: string; screens: ScreenKey[] }> = {
  gym: { scene: 'gym', screens: ['webDashboard', 'proTodayGym'] },
  studio: { scene: 'pilates', screens: ['webClassPilates', 'proTodayPilates'] },
  pt: { scene: 'pt', screens: ['proTodaySolo', 'proLog', 'proClient'] },
  client: { scene: 'client', screens: ['appHome', 'appBook', 'appCredit'] },
};
const AUDIENCES = Object.keys(STAGES) as Audience[];

for (const locale of locales) {
  const copy = messages[locale].site.home;

  test.describe(`F064 AC3 the I am switch in ${locale}`, () => {
    test('changes the miniature, the line and the screens, and no request leaves the page', async ({
      page,
    }) => {
      await page.goto(HOME[locale]);
      const requests: string[] = [];
      page.on('request', (request) => {
        if (request.resourceType() !== 'image') requests.push(request.url());
      });

      let previous: Audience | undefined;
      for (const audience of AUDIENCES) {
        await page.getByRole('button', { name: copy.iAm[audience], exact: true }).click();

        await expect(
          page.getByRole('button', { name: copy.iAm[audience], exact: true }),
        ).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByText(copy.audience[audience].short).first()).toBeVisible();
        await expect(page.locator('main img[srcset*="/scenes/"]').first()).toHaveAttribute(
          'srcset',
          new RegExp(`/scenes/${STAGES[audience].scene}-400`),
        );
        for (const screen of STAGES[audience].screens) {
          await expect(
            page.getByRole('img', { name: copy.screens[screen], exact: true }).first(),
          ).toBeVisible();
        }
        if (previous) {
          await expect(
            page.getByRole('button', { name: copy.iAm[previous], exact: true }),
          ).toHaveAttribute('aria-pressed', 'false');
          for (const screen of STAGES[previous].screens) {
            if (STAGES[audience].screens.includes(screen)) continue;
            // Another band may show the same screen (the platforms); the stage no longer does.
            await expect(
              page
                .locator('.site-stage')
                .getByRole('img', { name: copy.screens[screen], exact: true }),
            ).toHaveCount(0);
          }
        }
        previous = audience;
      }
      expect(requests).toEqual([]);
    });

    test('shows the gym first, with its laptop and phone side by side', async ({ page }) => {
      await page.goto(HOME[locale]);

      await expect(page.getByRole('button', { name: copy.iAm.gym, exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      const stage = page.locator('.site-stage');
      const laptop = stage.getByRole('img', { name: copy.screens.webDashboard, exact: true });
      const phone = stage.getByRole('img', { name: copy.screens.proTodayGym, exact: true });
      const [l, p] = await Promise.all([laptop.boundingBox(), phone.boundingBox()]);
      if (!l || !p) throw new Error('The screens have no box');
      // One top edge and one bottom edge, within the phone's bezel.
      expect(Math.abs(l.y - p.y)).toBeLessThanOrEqual(8);
      expect(Math.abs(l.y + l.height - (p.y + p.height))).toBeLessThanOrEqual(8);
    });

    test('the platforms switch goes from owners and trainers to clients', async ({ page }) => {
      await page.goto(HOME[locale]);
      const items = copy.platforms.items;

      await expect(page.getByRole('heading', { name: items.proIphone.title })).toBeVisible();
      await page.getByRole('button', { name: copy.platforms.clients, exact: true }).click();

      await expect(page.getByRole('heading', { name: items.clientIphone.title })).toBeVisible();
      await expect(page.getByRole('heading', { name: items.clientBrowser.title })).toBeVisible();
      await expect(page.getByRole('heading', { name: items.proIphone.title })).toHaveCount(0);
    });
  });

  test.describe(`F064 AC3 the sample booking in ${locale}`, () => {
    const card = copy.chain.card;
    const say = (text: string) => text.replace('{count}', '7');

    test('asks for confirmation, then moves the credits, with no request', async ({ page }) => {
      await page.goto(HOME[locale]);
      const requests: string[] = [];
      page.on('request', (request) => {
        if (request.resourceType() !== 'image') requests.push(request.url());
      });
      const tile = (label: string) =>
        page.locator('dl > div').filter({ has: page.getByText(label, { exact: true }) });
      const book = page.getByRole('button', { name: card.book, exact: true });

      await expect(page.getByText(say(card.say0))).toBeVisible();
      await expect(tile(card.left)).toContainText('7');
      await expect(tile(card.planned)).toContainText('0');
      await expect(tile(card.used)).toContainText('3');

      // Booking asks first, as the product does: nothing has moved yet.
      await book.click();
      await expect(page.getByText(card.confirmTitle)).toBeVisible();
      await expect(page.getByText(card.confirmBody.replace('{left}', '6'))).toBeVisible();
      await expect(tile(card.left)).toContainText('7');
      await expect(page.getByRole('button', { name: card.confirm, exact: true })).toBeFocused();

      // Going back changes nothing.
      await page.getByRole('button', { name: card.back, exact: true }).click();
      await expect(book).toBeVisible();
      await expect(tile(card.left)).toContainText('7');

      // Confirming plans one credit and ticks the booking.
      await book.click();
      await page.getByRole('button', { name: card.confirm, exact: true }).click();
      await expect(page.getByText(card.say1)).toBeVisible();
      await expect(tile(card.left)).toContainText('6');
      await expect(tile(card.planned)).toContainText('1');
      await expect(page.locator('[aria-current="step"]')).toContainText(
        copy.chain.steps.attendance.title,
      );

      // The trainer marks attendance: the credit is used.
      await page.getByRole('button', { name: card.attend, exact: true }).click();
      await expect(page.getByText(card.say2)).toBeVisible();
      await expect(tile(card.used)).toContainText('4');
      await expect(tile(card.planned)).toContainText('0');
      await expect(page.locator('[aria-current="step"]')).toHaveCount(0);

      // Once more starts again.
      await page.getByRole('button', { name: card.again, exact: true }).click();
      await expect(page.getByText(say(card.say0))).toBeVisible();
      await expect(tile(card.used)).toContainText('3');

      expect(requests).toEqual([]);
    });
  });

  test.describe(`F064 the home page's images in ${locale}`, () => {
    for (const colorScheme of ['light', 'dark'] as const) {
      test(`load for an anonymous visitor in ${colorScheme} mode, in the page's language`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme });
        await page.goto(HOME[locale]);
        // Lazy images load as they come near: scroll through the page.
        await page.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += 600) {
            window.scrollTo(0, y);
            await new Promise((resolve) => setTimeout(resolve, 60));
          }
        });

        const images = await page.locator('main img').evaluateAll((elements) =>
          (elements as HTMLImageElement[]).map((image) => ({
            src: image.currentSrc,
            loaded: image.complete && image.naturalWidth > 0,
          })),
        );
        expect(images.length).toBeGreaterThan(8);
        expect(images.filter(({ loaded }) => !loaded)).toEqual([]);
        const screens = images.filter(({ src }) => src.includes('/shots/'));
        for (const { src } of screens) {
          expect(src).toContain(`-${SHOT_LANGUAGE[locale]}-${colorScheme}-`);
        }
        expect(screens.length).toBeGreaterThan(5);
      });
    }

    test('are served without a session, as WebP', async ({ request }) => {
      for (const url of [
        '/site-images/scenes/gym-800.webp',
        `/site-images/shots/web-dashboard-${SHOT_LANGUAGE[locale]}-dark-1280.webp`,
      ]) {
        const response = await request.get(url, { maxRedirects: 0 });
        expect(response.status(), url).toBe(200);
        expect(response.headers()['content-type']).toBe('image/webp');
        expect(response.headers()['set-cookie']).toBeUndefined();
      }
    });
  });

  test.describe(`F064 the home page without JavaScript in ${locale}`, () => {
    test('has every band, the first audience and the sample booking in the HTML', async ({
      browser,
      baseURL,
    }) => {
      const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
      const page = await context.newPage();

      await page.goto(HOME[locale]);

      for (const heading of [
        copy.onePlace.heading,
        copy.chain.heading,
        copy.forWhom.heading,
        copy.platforms.heading,
        copy.promises.heading,
        copy.cta.heading,
      ]) {
        await expect(page.getByRole('heading', { name: heading, level: 2 })).toBeVisible();
      }
      await expect(page.getByText(copy.audience.gym.short).first()).toBeVisible();
      await expect(
        page.getByRole('button', { name: copy.chain.card.book, exact: true }),
      ).toBeVisible();
      await context.close();
    });
  });

  test.describe(`F064 the home page on a phone in ${locale}`, () => {
    test.use({ viewport: { width: 375, height: 800 } });

    test('does not scroll sideways, and shows a phone instead of the laptop', async ({ page }) => {
      await page.goto(HOME[locale]);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      const stage = page.locator('.site-stage');
      await expect(
        stage.getByRole('img', { name: copy.screens.proTodayGym, exact: true }),
      ).toBeVisible();
      await expect(
        stage.getByRole('img', { name: copy.screens.webDashboard, exact: true }),
      ).toBeHidden();
    });
  });
}

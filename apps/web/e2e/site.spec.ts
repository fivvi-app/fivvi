import { formattingLocales, type Locale, locales, messages } from '@fivvi/i18n';
import { sitePagePath } from '../site/routes';
import { undisclosedDetails } from '../test/undisclosed-details';
import { signInWithSession } from './accounts';
import { expect, expectNoAxeViolations, test } from './fixtures';

// F064, the public website's foundation (#637). The site is static, in both languages, and the
// language is the path's. Every project (the browser's language) visits both languages, so a page
// never depends on the browser. Copy comes from the catalogs (TESTING.md §5.4).
const HOME: Record<Locale, string> = { 'nl-NL': '/', en: '/en' };

for (const locale of locales) {
  const copy = messages[locale].site;

  test.describe(`F064 the home page in ${locale}`, () => {
    test('AC1: has its whole text in the HTML, without JavaScript', async ({
      browser,
      baseURL,
    }) => {
      const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
      const page = await context.newPage();

      await page.goto(HOME[locale]);

      await expect(page.locator('html')).toHaveAttribute('lang', formattingLocales[locale]);
      await expect(page).toHaveTitle(copy.meta.homeTitle);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        `${copy.home.headline} ${copy.home.headlineRest}`,
      );
      await expect(page.getByText(copy.home.lead)).toBeVisible();
      await expect(page.getByText(copy.home.status)).toBeVisible();
      // The hello page is gone.
      await expect(page.locator('form')).toHaveCount(0);
      await context.close();
    });

    for (const colorScheme of ['light', 'dark'] as const) {
      test(`passes axe in ${colorScheme} mode`, async ({ page }) => {
        await page.emulateMedia({ colorScheme });
        await page.goto(HOME[locale]);

        await expectNoAxeViolations(page, `the home page in ${locale}, ${colorScheme}`);
      });
    }

    test('AC7: the footer shows the trade name and its links, and no KvK or VAT number, address, phone or placeholder', async ({
      page,
    }) => {
      await page.goto(HOME[locale]);

      const footer = page.getByRole('contentinfo');
      await expect(footer).toContainText(copy.footer.tradeName.replace('{name}', 'K&S Apps'));
      for (const label of [
        copy.footer.support,
        copy.footer.privacy,
        copy.footer.terms,
        copy.footer.subProcessors,
      ]) {
        await expect(footer.getByRole('link', { name: label })).toBeVisible();
      }
      // The registration numbers, the street address and the phone number are in the terms and the
      // privacy policy only.
      await expect(footer).not.toContainText(undisclosedDetails);
      await expect(footer).not.toContainText('{{');
      await expect(footer.locator('dl')).toHaveCount(0);
    });

    test('AC8: the help page shows the support address and the way to the demo form, and no phone number or business details list', async ({
      page,
    }) => {
      await page.goto(sitePagePath('support', locale));

      const main = page.getByRole('main');
      await expect(main.getByRole('link', { name: 'support@fivvi.app' })).toHaveAttribute(
        'href',
        'mailto:support@fivvi.app',
      );
      await expect(main.getByRole('link', { name: copy.cta.demo })).toBeVisible();
      await expect(main).not.toContainText(undisclosedDetails);
      await expect(main.locator('a[href^="tel:"]')).toHaveCount(0);
    });

    // AC13: the markup of the site carries no `robots` tag; the header does the work per
    // environment (`site/indexing.ts`), and this e2e server is not production.
    test('a page of the site sends noindex in the header here, as every environment but production does', async ({
      request,
    }) => {
      const response = await request.get(HOME[locale]);

      expect(response.headers()['x-robots-tag']).toBe('noindex, nofollow');
    });

    test('AC16: sets no cookie and nothing in the browser, and the sign-in link goes to /login', async ({
      page,
      context,
      request,
    }) => {
      const response = await request.get(HOME[locale]);
      expect(response.headers()['set-cookie']).toBeUndefined();

      await page.goto(HOME[locale]);

      expect(await context.cookies()).toEqual([]);
      expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([
        0, 0,
      ]);
      const signIn = page.getByRole('link', { name: copy.header.signIn });
      await expect(signIn).toHaveAttribute('href', '/login');
      await signIn.click();
      await expect(page).toHaveURL(/\/login$/);
    });
  });
}

test.describe('F064 AC16 the language is the path’s', () => {
  test('the switch goes to the same page in the other language and back', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', formattingLocales['nl-NL']);

    await page.getByRole('link', { name: messages.en.site.language.enName }).click();
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.locator('html')).toHaveAttribute('lang', formattingLocales.en);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      messages.en.site.home.headline,
    );

    await page.getByRole('link', { name: messages['nl-NL'].site.language.nlName }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('html')).toHaveAttribute('lang', formattingLocales['nl-NL']);
  });

  for (const [browserLanguage, path, shown] of [
    ['en-GB', '/', 'nl-NL'],
    ['nl-NL', '/en', 'en'],
    ['de-DE', '/', 'nl-NL'],
    ['de-DE', '/en', 'en'],
  ] as const) {
    test.describe(`on a browser in ${browserLanguage}`, () => {
      test.use({ locale: browserLanguage });

      test(`${path} stays ${shown}: no redirect by the browser's language`, async ({
        page,
        request,
      }) => {
        const answer = await request.get(path, {
          headers: { 'accept-language': browserLanguage },
          maxRedirects: 0,
        });
        expect(answer.status()).toBe(200);

        await page.goto(path);

        await expect(page).toHaveURL(new RegExp(`${path === '/' ? '/$' : `${path}$`}`));
        await expect(page.locator('html')).toHaveAttribute('lang', formattingLocales[shown]);
      });
    });
  }
});

test.describe('F064 AC18 a signed-in user opens the home page', () => {
  test('goes to their home in the app', async ({ page, context }) => {
    await signInWithSession(context, 'owner@example.com');

    await page.goto('/');

    await expect(page).toHaveURL(/\/w\/johns-gym$/);
  });

  test('an expired or unknown sign-in session shows the page', async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([
      { name: 'better-auth.session_token', value: 'unknown.session', url: baseURL ?? '' },
    ]);

    await page.goto('/');

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});

test.describe('F064 an address that matches no page', () => {
  test('answers 404 with its message in both languages, not Next.js’s English one', async ({
    page,
  }) => {
    // The app and the site have a root layout each, so this page is `app/global-not-found.tsx`.
    // A public address nothing serves yet (booking pages, F037+), so the guard leaves it alone.
    const response = await page.goto('/book/pilot-gym');

    expect(response?.status()).toBe(404);
    for (const locale of locales) {
      const { title, body } = messages[locale].notFound;
      await expect(page.getByText(title, { exact: true })).toBeVisible();
      await expect(page.getByText(body)).toBeVisible();
    }
    await expect(page.getByText('This page could not be found')).toHaveCount(0);
  });
});

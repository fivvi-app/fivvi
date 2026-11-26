import type { Locale } from '@fivvi/i18n';
import type { BrowserContext, Page } from '@playwright/test';
import { clientIpHeaders, signInWithSession } from './accounts';
import { expect, test } from './fixtures';
import { seedClassDate, seedKrachtClass, team } from './trainer-assignment-world';

// F014 and F013 (#1595): the pages that read a day or a week from the API, for an account with no
// stored language, name a class in the language of the page: the API takes it from the
// `Accept-Language` the server-side fetch sends, the page's own language. A class has a Dutch and an
// English name, so a page that sends only the cookie shows the English one on a Dutch page.

/** Today in Dutch time, `YYYY-MM-DD`: the day the Dashboard and *Mijn dag* show. */
const today = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(new Date());

test.describe('#1595 a class is named in the page’s language for an account with no stored language', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
  });

  /** John's Gym with Sarah teaching a Kracht (Strength) today, and the class's name in the language of the page. */
  async function seed(page: Page, context: BrowserContext, appLocale: Locale) {
    const world = await team(page, context);
    const classId = await seedKrachtClass(page.request, world.base, world.trainer('Sarah'));
    await seedClassDate(page.request, world.base, classId, today(), world.trainer('Sarah'));
    return {
      ...world,
      name: appLocale === 'en' ? 'Strength' : 'Kracht',
      other: appLocale === 'en' ? 'Kracht' : 'Strength',
    };
  }

  /** What the page shows: the class by the name of the page's language, and not by the other one. */
  async function expectNamed(page: Page, path: string, name: string, other: string) {
    await page.goto(path);
    const main = page.getByRole('main');
    await expect(main).toContainText(name);
    await expect(main).not.toContainText(other);
  }

  test('the Owner’s Dashboard (GET /day)', async ({ page, context, appLocale }) => {
    const { slug, name, other } = await seed(page, context, appLocale);
    await expectNamed(page, `/w/${slug}`, name, other);
  });

  test('Mijn dag (GET /me/day)', async ({ page, context, appLocale }) => {
    const { sarah, name, other } = await seed(page, context, appLocale);
    await context.clearCookies();
    await signInWithSession(context, sarah);
    await expectNamed(page, '/me/day', name, other);
  });

  test('Mijn agenda (GET /me/sessions)', async ({ page, context, appLocale }) => {
    const { sarah, name, other } = await seed(page, context, appLocale);
    await context.clearCookies();
    await signInWithSession(context, sarah);
    await expectNamed(page, '/me/calendar', name, other);
  });
});

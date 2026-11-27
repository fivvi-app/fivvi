import { formattingLocales, type Locale, messages } from '@fivvi/i18n';
import type { Page } from '@playwright/test';
import {
  clientIpHeaders,
  createAccount,
  createGymWithTrainer,
  joinTeam,
  newAddress,
  newAllowedAddress,
  signInWithSession,
} from './accounts';
import { expect, expectNoAxeViolations, test } from './fixtures';
import { signInWithCode } from './sign-in-page';

// F030 (spec #480), the web ticket #787: the client layout, the client home and where a signed-in
// person lands. Mark has an account and no workspace and is not on the sign-up allowlist; John
// is on it, with no workspace in a fresh test; Sarah is a Trainer of John's Gym. Each test has
// accounts of its own (see language.spec.ts). Copy comes from the catalogs. The client web is
// phone first, so the whole file runs on a phone-sized window.
test.use({ viewport: { width: 390, height: 844 } });

/** The two locales' catalogs, for the texts that must read the same in both. */
const catalog = (locale: Locale) => messages[locale];

interface Me {
  preferredLocale: Locale | null;
}

const storedLanguage = async (page: Page) =>
  ((await (await page.request.get('/api/v1/me')).json()) as Me).preferredLocale;

test.describe('F030 the client web', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
  });

  test('AC1: Mark signs in and lands on the client home with the tabs and NL | EN in the header', async ({
    page,
    appLocale,
    messages: copy,
  }) => {
    const mark = newAddress('mark');
    await createAccount(mark, undefined, 'Mark Jansen');
    await page.goto('/login');

    await signInWithCode(page, copy, mark);

    await expect(page).toHaveURL('/my');
    await expect(page).toHaveTitle(copy.clientNav.home);
    // The large title, with today's date above it, and no studio badge.
    await expect(page.getByRole('heading', { level: 1, name: copy.clientNav.home })).toBeVisible();
    // No studio: where to get the link, and what to do with it, in this language.
    await expect(page.getByText(copy.noWorkspace.title)).toBeVisible();
    await expect(page.getByText(copy.clientWeb.noWorkspace.haveLink)).toBeVisible();
    // The tabs of the app, without Activiteit until M7.
    const tabs = page.getByRole('navigation', { name: copy.clientNav.label });
    await expect(tabs.getByRole('link')).toHaveText([
      copy.clientNav.home,
      copy.clientNav.book,
      copy.clientNav.profile,
    ]);
    await expect(tabs.getByRole('link', { name: copy.clientNav.home })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // NL | EN in the header, the page's language marked.
    const language = page.getByRole('group', { name: copy.clientWeb.language.label });
    await expect(language.getByRole('button')).toHaveText([
      copy.clientWeb.language.nlShort,
      copy.clientWeb.language.enShort,
    ]);
    await expect(
      language.getByRole('button', {
        name: appLocale === 'en' ? copy.clientWeb.language.enName : copy.clientWeb.language.nlName,
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    // No account menu, and nothing that sets a workspace up.
    await expect(page.getByRole('button', { name: copy.userMenu.label })).toHaveCount(0);
    await expect(page.getByRole('link', { name: copy.welcome.submit })).toHaveCount(0);
    await expect(page.getByRole('button', { name: copy.welcome.submit })).toHaveCount(0);

    // The client web's secondary text is #6C6C70 (ADR-032): the date above the title.
    const date = page.locator('main p').first();
    await expect(date).toHaveCSS('color', 'rgb(108, 108, 112)');
    await expectNoAxeViolations(page, `the client home in ${appLocale}`);
  });

  test('AC1: the same in the other language: the texts of both catalogs', async ({
    page,
    context,
    appLocale,
    otherLocale,
  }) => {
    const mark = newAddress('mark');
    await createAccount(mark, otherLocale, 'Mark Jansen');
    await signInWithSession(context, mark);

    // The account's stored language wins over the browser's (ADR-017).
    await page.goto('/my');

    const other = catalog(otherLocale);
    await expect(page.locator('html')).toHaveAttribute('lang', formattingLocales[otherLocale]);
    await expect(page.getByText(other.noWorkspace.title)).toBeVisible();
    await expect(page.getByText(other.clientWeb.noWorkspace.haveLink)).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: other.clientNav.label })
        .getByRole('link', { name: other.clientNav.book }),
    ).toBeVisible();
    await expectNoAxeViolations(page, `the client home in ${otherLocale}, a ${appLocale} browser`);
  });

  test('AC1: Boeken shows the same no-studio text as Home, and Profiel the large title', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const mark = newAddress('mark');
    await createAccount(mark, undefined, 'Mark Jansen');
    await signInWithSession(context, mark);
    await page.goto('/my');
    const tabs = page.getByRole('navigation', { name: copy.clientNav.label });

    await tabs.getByRole('link', { name: copy.clientNav.book }).click();
    await expect(page).toHaveURL('/my/book');
    await expect(page).toHaveTitle(copy.clientNav.book);
    await expect(page.getByRole('heading', { level: 1, name: copy.clientNav.book })).toBeVisible();
    await expect(page.getByText(copy.noWorkspace.title)).toBeVisible();
    await expect(page.getByText(copy.clientWeb.noWorkspace.haveLink)).toBeVisible();
    await expect(tabs.getByRole('link', { name: copy.clientNav.book })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expectNoAxeViolations(page, `Boeken in ${appLocale}`);

    await tabs.getByRole('link', { name: copy.clientNav.profile }).click();
    await expect(page).toHaveURL('/my/profile');
    await expect(
      page.getByRole('heading', { level: 1, name: copy.clientNav.profile }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: copy.signOut.label })).toBeVisible();
    await expectNoAxeViolations(page, `Profiel in ${appLocale}`);
  });

  test('AC5: the client web offers Mark no way to create a workspace, and /welcome sends him back', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const mark = newAddress('mark');
    await createAccount(mark, undefined, 'Mark Jansen');
    await signInWithSession(context, mark);

    for (const path of ['/my', '/my/book', '/my/profile']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByRole('link', { name: copy.welcome.submit })).toHaveCount(0);
      await expect(page.getByRole('button', { name: copy.welcome.submit })).toHaveCount(0);
      await expect(page.locator('a[href^="/welcome"]')).toHaveCount(0);
    }

    // TW-11 is out of reach: the signed-in home and /welcome both end at the client home.
    await page.goto('/welcome');
    await expect(page).toHaveURL('/my');
    await page.goto('/home');
    await expect(page).toHaveURL('/my');
    await expectNoAxeViolations(page, `the client home after /welcome in ${appLocale}`);
  });

  test('AC5: John, on the allowlist with no workspace, still gets the first run', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const john = newAllowedAddress('john');
    await createAccount(john, undefined, 'John');
    await signInWithSession(context, john);

    await page.goto('/home');

    await expect(page).toHaveURL('/welcome');
    await expect(page.getByRole('heading', { level: 1, name: copy.welcome.title })).toBeVisible();
    await expect(page.getByRole('button', { name: copy.welcome.submit })).toBeVisible();
    await expectNoAxeViolations(page, `the first run in ${appLocale}`);
  });

  test('Sarah, a Trainer of John’s Gym, signs in and lands on the trainer web as before', async ({
    page,
    messages: copy,
  }) => {
    const john = newAddress('john');
    const sarah = newAddress('sarah');
    await createAccount(john, undefined, 'John');
    await createAccount(sarah, undefined, 'Sarah');
    const slug = await createGymWithTrainer(john, "John's Gym", 'owner');
    await joinTeam(sarah, slug, 'trainer');
    await page.goto('/login');

    await signInWithCode(page, copy, sarah);

    // A Trainer's home is Mijn dag (F013); an Owner's would be the workspace.
    await expect(page).toHaveURL('/me/day');
    await expect(page.getByRole('navigation', { name: copy.workspaceNav.label })).toBeVisible();
    await expect(page.locator('[data-slot="client-tabs"]')).toHaveCount(0);
  });

  test('Uitloggen on Profiel signs out and shows the sign-in page', async ({
    page,
    context,
    messages: copy,
  }) => {
    const mark = newAddress('mark');
    await createAccount(mark, undefined, 'Mark Jansen');
    await signInWithSession(context, mark);
    await page.goto('/my/profile');

    await page.getByRole('button', { name: copy.signOut.label }).click();

    await expect(page).toHaveURL('/login');
    await expect(page.getByRole('heading', { level: 1, name: copy.signIn.title })).toBeVisible();
    // Signed out for real: the client web is guarded again.
    await page.goto('/my');
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fmy$/);
  });

  test('Switching NL | EN in the header changes the page language and stores it on the account', async ({
    page,
    context,
    appLocale,
    otherLocale,
    messages: copy,
  }) => {
    const mark = newAddress('mark');
    await createAccount(mark, undefined, 'Mark Jansen');
    await signInWithSession(context, mark);
    await page.goto('/my');
    expect(await storedLanguage(page)).toBeNull();
    const other = catalog(otherLocale);
    const name = (locale: Locale) =>
      locale === 'en' ? copy.clientWeb.language.enName : copy.clientWeb.language.nlName;

    await page.getByRole('button', { name: name(otherLocale) }).click();

    // Re-rendered in place, in the other language, and saved (F010).
    await expect(page.locator('html')).toHaveAttribute('lang', formattingLocales[otherLocale]);
    await expect(page.getByText(other.noWorkspace.title)).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: other.clientNav.home })).toBeVisible();
    await expect(page.getByRole('button', { name: name(otherLocale) })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(await storedLanguage(page)).toBe(otherLocale);
    await expectNoAxeViolations(page, `the client home switched from ${appLocale}`);

    // The next page, and a reload, stay in it.
    await page.getByRole('link', { name: other.clientNav.profile }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: other.clientNav.profile }),
    ).toBeVisible();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', formattingLocales[otherLocale]);
  });
});

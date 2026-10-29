import { formattingLocales, type Locale, messages } from '@fivvi/i18n';
import type { Page } from '@playwright/test';
import {
  clientIpHeaders,
  createAccount,
  createGymWithTrainer,
  newAddress,
  signInWithSession,
} from './accounts';
import { emailsTo, waitForEmails } from './brevo';
import { expect, expectNoAxeViolations, test } from './fixtures';
import { appServer } from './servers';
import { signInWithCode } from './sign-in-page';

// F010, the language switch in the user menu of a workspace's pages. Copy comes from the
// catalogs. Each spec has an account and a workspace of its own: the seeded account is shared by
// every spec, and a stored language would change what they see.

/** The language written in its own language, as the menu offers it. */
const ownName = (locale: Locale) =>
  locale === 'en' ? messages.en.userMenu.languageEn : messages['nl-NL'].userMenu.languageNl;

interface Me {
  preferredLocale: Locale | null;
}

const storedLanguage = async (page: Page) =>
  ((await (await page.request.get('/api/v1/me')).json()) as Me).preferredLocale;

test.describe('F010 language switch on the web', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
  });

  test('AC1: switching re-renders in place and saves', async ({
    page,
    context,
    appLocale,
    otherLocale,
    messages: copy,
  }) => {
    const address = newAddress('john');
    await createAccount(address);
    const slug = await createGymWithTrainer(address, "John's Gym", 'owner');
    await signInWithSession(context, address);
    await page.goto(`/w/${slug}/settings/general`);
    const other = messages[otherLocale];
    // The page shows the language of the browser: nothing is stored yet.
    await expect(page.locator('html')).toHaveAttribute('lang', formattingLocales[appLocale]);
    await expect(
      page.getByRole('heading', { level: 1, name: copy.settingsGeneral.title }),
    ).toBeVisible();
    expect(await storedLanguage(page)).toBeNull();
    const name = page.getByLabel(copy.settingsGeneral.nameLabel);
    await name.fill('Typed but not saved');

    await page.getByRole('button', { name: copy.userMenu.label }).click();
    // The row names the current language in its own language ...
    const row = page.getByRole('button', {
      name: copy.userMenu.language.replace('{language}', ownName(appLocale)),
    });
    await expect(row).toBeVisible();
    await expectNoAxeViolations(page, `the open user menu in ${appLocale}`);
    await row.click();
    // ... and the two options are written in their own language, the current one marked.
    const current = page.getByRole('button', { name: ownName(appLocale), exact: true });
    await expect(current).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page.getByRole('button', { name: ownName(otherLocale), exact: true }),
    ).toHaveAttribute('aria-pressed', 'false');
    await expectNoAxeViolations(page, `the language options in ${appLocale}`);

    // A navigation would reload the document; the marker below survives only a re-render.
    await page.evaluate(() => {
      (window as unknown as { __notReloaded: boolean }).__notReloaded = true;
    });
    await page.getByRole('button', { name: ownName(otherLocale), exact: true }).click();

    await expect(
      page.getByRole('heading', { level: 1, name: other.settingsGeneral.title }),
    ).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', formattingLocales[otherLocale]);
    expect(
      await page.evaluate(() => (window as unknown as { __notReloaded?: boolean }).__notReloaded),
    ).toBe(true);
    // What was typed is still there, under the new label.
    await expect(page.getByLabel(other.settingsGeneral.nameLabel)).toHaveValue(
      'Typed but not saved',
    );
    // The data path: the account now stores it.
    expect(await storedLanguage(page)).toBe(otherLocale);
    // The menu now names the new language.
    await page.getByRole('button', { name: other.userMenu.label }).click();
    await expect(
      page.getByRole('button', {
        name: other.userMenu.language.replace('{language}', ownName(otherLocale)),
      }),
    ).toBeVisible();
    await expectNoAxeViolations(page, `the user menu after the switch to ${otherLocale}`);
  });

  test('AC2: a second browser context follows the stored preference', async ({
    page,
    context,
    browser,
    appLocale,
    otherLocale,
    messages: copy,
  }) => {
    const address = newAddress('second');
    await createAccount(address);
    const slug = await createGymWithTrainer(address, "John's Gym", 'owner');
    await signInWithSession(context, address);
    await page.goto(`/w/${slug}/settings/general`);
    await page.getByRole('button', { name: copy.userMenu.label }).click();
    await page
      .getByRole('button', {
        name: copy.userMenu.language.replace('{language}', ownName(appLocale)),
      })
      .click();
    await page.getByRole('button', { name: ownName(otherLocale), exact: true }).click();
    await expect.poll(() => storedLanguage(page)).toBe(otherLocale);

    // Another browser: set to the old language, with an old language cookie.
    const second = await browser.newContext({
      baseURL: appServer.baseURL,
      locale: formattingLocales[appLocale],
      extraHTTPHeaders: clientIpHeaders(),
    });
    try {
      await signInWithSession(second, address);
      await second.addCookies([{ name: 'NEXT_LOCALE', value: appLocale, url: appServer.baseURL }]);
      const secondPage = await second.newPage();
      await secondPage.goto(`/w/${slug}/settings/general`);

      await expect(
        secondPage.getByRole('heading', {
          level: 1,
          name: messages[otherLocale].settingsGeneral.title,
        }),
      ).toBeVisible();
      await expect(secondPage.locator('html')).toHaveAttribute(
        'lang',
        formattingLocales[otherLocale],
      );
      // The cookie of that browser was rewritten to the stored language.
      const cookies = await second.cookies();
      expect(cookies.find((cookie) => cookie.name === 'NEXT_LOCALE')?.value).toBe(otherLocale);
    } finally {
      await second.close();
    }
  });

  test('a language that could not be saved stays as it was, and says so', async ({
    page,
    context,
    appLocale,
    otherLocale,
    messages: copy,
  }) => {
    const address = newAddress('offline');
    await createAccount(address);
    const slug = await createGymWithTrainer(address, "John's Gym");
    await signInWithSession(context, address);
    await page.goto(`/w/${slug}`);
    await page.route('**/api/v1/me', (route) =>
      route.request().method() === 'PATCH' ? route.abort() : route.continue(),
    );
    await page.getByRole('button', { name: copy.userMenu.label }).click();
    await page
      .getByRole('button', {
        name: copy.userMenu.language.replace('{language}', ownName(appLocale)),
      })
      .click();

    await page.getByRole('button', { name: ownName(otherLocale), exact: true }).click();

    await expect(page.locator('#user-menu').getByRole('alert')).toHaveText(copy.userMenu.error);
    await expect(page.locator('html')).toHaveAttribute('lang', formattingLocales[appLocale]);
    expect(await storedLanguage(page)).toBeNull();
  });
});

// F010, the language switch on the sign-in page (TW-10): signed out, nothing is saved on an
// account until sign-in.
test.describe('F010 language switch on the sign-in page', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
  });

  const switchButton = (page: Page, locale: Locale) =>
    page.getByRole('button', { name: ownName(locale), exact: true });

  const localeCookie = async (page: Page) =>
    (await page.context().cookies()).find((cookie) => cookie.name === 'NEXT_LOCALE')?.value;

  test('AC4: choosing a language switches the page, is kept, and the email follows it', async ({
    page,
    appLocale,
    otherLocale,
    messages: copy,
  }) => {
    const address = newAddress('chooser');
    await createAccount(address);
    const other = messages[otherLocale];
    await page.goto('/login');
    await expect(switchButton(page, appLocale)).toHaveAttribute('aria-pressed', 'true');
    await expect(switchButton(page, otherLocale)).toHaveAttribute('aria-pressed', 'false');
    await expectNoAxeViolations(page, `the sign-in page with the switch in ${appLocale}`);
    await page.evaluate(() => {
      (window as unknown as { __notReloaded: boolean }).__notReloaded = true;
    });

    await switchButton(page, otherLocale).click();

    await expect(page.getByRole('heading', { level: 1, name: other.signIn.title })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', formattingLocales[otherLocale]);
    await expect(switchButton(page, otherLocale)).toHaveAttribute('aria-pressed', 'true');
    expect(
      await page.evaluate(() => (window as unknown as { __notReloaded?: boolean }).__notReloaded),
    ).toBe(true);
    expect(await localeCookie(page)).toBe(otherLocale);
    await expectNoAxeViolations(page, `the sign-in page after the switch to ${otherLocale}`);

    // The choice is kept on a reload.
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: other.signIn.title })).toBeVisible();

    // The account has no stored language, so the email is in the language of the page.
    await page.getByLabel(other.signIn.emailLabel).fill(address);
    await page.getByRole('button', { name: other.signIn.sendCode }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: other.signIn.checkEmailTitle }),
    ).toBeVisible();
    const [email] = await waitForEmails(address);
    expect(email?.subject).toBe(other.email.signIn.subject);
    expect(email?.subject).not.toBe(copy.email.signIn.subject);
    expect(await emailsTo(address)).toHaveLength(1);
  });

  test('AC5: the choice becomes the stored language at sign-in, and without one the stored language applies', async ({
    page,
    browser,
    baseURL,
    appLocale,
    otherLocale,
    messages: copy,
  }) => {
    const other = messages[otherLocale];
    // Stored in the language this project does not run in: the page language alone would not
    // lead there.
    const chooser = newAddress('stored-chooser');
    await createAccount(chooser, appLocale);
    await page.goto('/login');
    await switchButton(page, otherLocale).click();
    await expect(page.getByRole('heading', { level: 1, name: other.signIn.title })).toBeVisible();

    // The stored language wins for the email (ADR-019).
    await signInWithCode(page, other, chooser);

    await expect(page).toHaveURL(`${baseURL}/home`);
    await expect(page.getByRole('heading', { level: 1, name: other.noAccess.title })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', formattingLocales[otherLocale]);
    expect(await storedLanguage(page)).toBe(otherLocale);

    // Another browser that chose nothing: the stored language applies, not the browser language.
    const quiet = await browser.newContext({
      baseURL,
      locale: formattingLocales[appLocale],
      extraHTTPHeaders: clientIpHeaders(),
    });
    try {
      const quietPage = await quiet.newPage();
      const address = newAddress('stored-quiet');
      await createAccount(address, otherLocale);
      await quietPage.goto('/login');
      await expect(
        quietPage.getByRole('heading', { level: 1, name: copy.signIn.title }),
      ).toBeVisible();
      await signInWithCode(quietPage, copy, address);
      await expect(
        quietPage.getByRole('heading', { level: 1, name: other.noAccess.title }),
      ).toBeVisible();
      expect(await storedLanguage(quietPage)).toBe(otherLocale);
    } finally {
      await quiet.close();
    }
  });

  test('AC6: after sign-out the language stays on this browser', async ({
    page,
    baseURL,
    otherLocale,
    messages: copy,
  }) => {
    const other = messages[otherLocale];
    const address = newAddress('leaver');
    await createAccount(address, otherLocale);
    await page.goto('/login');
    await signInWithCode(page, copy, address);
    await expect(page.getByRole('heading', { level: 1, name: other.noAccess.title })).toBeVisible();

    await page.getByRole('button', { name: other.signOut.label }).click();

    await expect(page).toHaveURL(`${baseURL}/login`);
    await expect(page.getByRole('heading', { level: 1, name: other.signIn.title })).toBeVisible();
    expect(await localeCookie(page)).toBe(otherLocale);
  });
});

import { formattingLocales, type Locale, messages } from '@fivvi/i18n';
import type { Page } from '@playwright/test';
import {
  clientIpHeaders,
  createAccount,
  createGymWithTrainer,
  newAddress,
  newAllowedAddress,
  signInWithSession,
} from './accounts';
import { emailsTo, waitForEmails } from './brevo';
import { expect, expectNoAxeViolations, test } from './fixtures';
import { appServer } from './servers';
import { signInWithCode } from './sign-in-page';
import { holdBackPageTitle } from './streamed-title';

// F010: the language switch in the user menu of a workspace's pages (AC1, AC2) and TW-08 Settings →
// Language, where the Owner sets the workspace's default communication language (AC7 to AC10).
// Copy comes from the catalogs. Each spec has an account and a workspace of its own: the seeded
// account is shared by every spec, and a stored language would change what they see. The AC7 to
// AC10 specs sign in with an address and a visitor IP of their own (see workspaces.spec.ts); the
// seeded account owner@example.com plays the Owner of another workspace.
const SEEDED_OWNER = 'owner@example.com';

/** The language written in its own language, as the menu offers it. */
const ownName = (locale: Locale) =>
  locale === 'en' ? messages.en.userMenu.languageEn : messages['nl-NL'].userMenu.languageNl;

interface Me {
  preferredLocale: Locale | null;
  workspaces: { id: string; slug: string }[];
}

const storedLanguage = async (page: Page) =>
  ((await (await page.request.get('/api/v1/me')).json()) as Me).preferredLocale;

test.describe('F010 language', () => {
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
    // The title streams in after the body (#353), and axe wants one: wait for it.
    await expect(page).toHaveTitle(other.settingsGeneral.title);
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

  test('AC7: the Owner sets the default language; nobody’s interface language changes', async ({
    page,
    appLocale,
    messages: copy,
  }) => {
    await page.goto('/login');
    await signInWithCode(page, copy, newAllowedAddress('language'));
    await page.getByLabel(copy.welcome.personNameLabel).fill('John');
    await page.getByLabel(copy.welcome.workspaceNameLabel).fill("John's Gym");
    await page.getByRole('button', { name: copy.welcome.submit }).click();
    await expect(page).toHaveURL(/\/w\/johns-gym-\d+$/);
    const home = new URL(page.url()).pathname;
    const me = (await (await page.request.get('/api/v1/me')).json()) as Me;
    const workspaceId = me.workspaces[0]?.id;
    if (!workspaceId) throw new Error('The Owner has no workspace.');

    // Language is in the Owner's navigation, next to General.
    await page.getByRole('link', { name: copy.workspaceNav.settingsLanguage }).click();
    await expect(page).toHaveURL(`${home}/settings/language`);
    await expect(
      page.getByRole('heading', { level: 1, name: copy.settingsLanguage.title }),
    ).toBeVisible();
    await expect(page.getByRole('radio', { name: copy.settingsLanguage.optionNl })).toBeChecked();
    await expect(
      page.getByRole('group', { name: copy.settingsLanguage.defaultLabel }),
    ).toHaveAccessibleDescription(copy.settingsLanguage.help);
    await expectNoAxeViolations(page, `TW-08 Language in ${appLocale}`);

    await page.getByRole('radio', { name: copy.settingsLanguage.optionEn }).check();
    await page.getByRole('button', { name: copy.settingsLanguage.save }).click();
    await expect(page.getByText(copy.settingsLanguage.saved)).toBeVisible();

    // The data path: the API holds `en` for the workspace; the Owner's own language is untouched
    // and so is the language of this page.
    const workspace = (await (
      await page.request.get(`/api/v1/workspaces/${workspaceId}`)
    ).json()) as {
      defaultLocale: string;
    };
    expect(workspace.defaultLocale).toBe('en');
    const after = (await (await page.request.get('/api/v1/me')).json()) as Me;
    expect(after.preferredLocale).toBe(me.preferredLocale);
    await expect(
      page.getByRole('heading', { level: 1, name: copy.settingsLanguage.title }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByRole('radio', { name: copy.settingsLanguage.optionEn })).toBeChecked();
    await expectNoAxeViolations(page, `TW-08 Language saved in ${appLocale}`);

    // AC9: the Owner of another workspace gets 404 on read and set, anonymous gets 401.
    await page.context().clearCookies();
    await signInWithSession(page.context(), SEEDED_OWNER);
    const path = `/api/v1/workspaces/${workspaceId}`;
    expect((await page.request.get(path)).status()).toBe(404);
    expect((await page.request.patch(path, { data: { defaultLocale: 'nl-NL' } })).status()).toBe(
      404,
    );
    await page.context().clearCookies();
    expect((await page.request.get(path)).status()).toBe(401);
    expect((await page.request.patch(path, { data: { defaultLocale: 'nl-NL' } })).status()).toBe(
      401,
    );
  });

  test('AC8: a Trainer has no Language, sees the no-permission page, and the route answers 403', async ({
    page,
    appLocale,
    messages: copy,
  }) => {
    const address = newAddress('trainer');
    await createAccount(address);
    const slug = await createGymWithTrainer(address, "John's Gym");
    await page.goto('/login');
    await signInWithCode(page, copy, address);

    await expect(page).toHaveURL(`/w/${slug}`);
    await expect(page.getByRole('link', { name: copy.workspaceNav.settingsLanguage })).toHaveCount(
      0,
    );

    await page.goto(`/w/${slug}/settings/language`);
    await expect(
      page.getByRole('heading', { level: 1, name: copy.noPermission.title }),
    ).toBeVisible();
    await expect(page.getByRole('radio')).toHaveCount(0);
    await expectNoAxeViolations(page, `the no-permission page in ${appLocale}`);

    const me = (await (await page.request.get('/api/v1/me')).json()) as Me;
    const workspace = me.workspaces[0];
    if (!workspace) throw new Error('The Trainer has no workspace.');
    const refused = await page.request.patch(`/api/v1/workspaces/${workspace.id}`, {
      data: { defaultLocale: 'en' },
    });
    expect(refused.status()).toBe(403);
    const read = await page.request.get(`/api/v1/workspaces/${workspace.id}`);
    expect(((await read.json()) as { defaultLocale: string }).defaultLocale).toBe('nl-NL');
  });

  test('AC10: another language than nl-NL or en answers 400 and nothing is stored', async ({
    page,
  }) => {
    await signInWithSession(page.context(), SEEDED_OWNER);
    const me = (await (await page.request.get('/api/v1/me')).json()) as Me;
    const workspace = me.workspaces[0];
    if (!workspace) throw new Error('The seeded Owner has no workspace.');
    const before = (await (
      await page.request.get(`/api/v1/workspaces/${workspace.id}`)
    ).json()) as {
      defaultLocale: string;
    };

    const refused = await page.request.patch(`/api/v1/workspaces/${workspace.id}`, {
      data: { defaultLocale: 'nl-BE' },
    });

    expect(refused.status()).toBe(400);
    expect(((await refused.json()) as { code: string }).code).toBe('validation_failed');
    const after = (await (await page.request.get(`/api/v1/workspaces/${workspace.id}`)).json()) as {
      defaultLocale: string;
    };
    expect(after.defaultLocale).toBe(before.defaultLocale);
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
    // The title streams in after the body (#353), and axe wants one: wait for it.
    await expect(page).toHaveTitle(other.signIn.title);
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

  // #353: the new heading and the new <title> do not arrive together. The title is held back here
  // to make the gap last, so no run depends on timing.
  test('AC4: while the title of the switched page is on its way, axe has no title to judge', async ({
    page,
    appLocale,
    otherLocale,
  }) => {
    const other = messages[otherLocale];
    const title = await holdBackPageTitle(page);
    await page.goto('/login');
    await expect(page).toHaveTitle(messages[appLocale].signIn.title);

    await switchButton(page, otherLocale).click();

    await expect(page.getByRole('heading', { level: 1, name: other.signIn.title })).toBeVisible();
    await expect(switchButton(page, otherLocale)).toHaveAttribute('aria-pressed', 'true');
    // The page is in the new language, and without a title, which axe does not let through.
    await expect.poll(() => page.title()).toBe('');
    await expect(expectNoAxeViolations(page, 'the page without its title')).rejects.toThrow(
      /document-title/,
    );

    await title.release();

    await expect(page).toHaveTitle(other.signIn.title);
    await expectNoAxeViolations(page, `the sign-in page after the switch to ${otherLocale}`);
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

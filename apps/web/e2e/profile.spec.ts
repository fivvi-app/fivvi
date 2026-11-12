import { formattingLocales, type Locale, messages } from '@fivvi/i18n';
import type { Page } from '@playwright/test';
import {
  clientIpHeaders,
  createAccount,
  createGymWithTrainer,
  joinTeam,
  newAddress,
  signInWithSession,
} from './accounts';
import { expect, expectNoAxeViolations, test } from './fixtures';

// F005 (spec #173): a team member corrects their own name on My profile (TW-09). Copy comes from
// the catalogs. Each spec has accounts and a workspace of its own (see language.spec.ts): John
// owns John's Gym, Sarah is a Trainer there.
const GYM = "John's Gym";

test.describe('F005 my name', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
  });

  async function team() {
    const john = newAddress('john');
    const sarah = newAddress('sarah');
    await createAccount(john, undefined, 'John');
    await createAccount(sarah, undefined, 'Sara');
    const slug = await createGymWithTrainer(john, GYM, 'owner');
    await joinTeam(sarah, slug, 'trainer');
    return { john, sarah, slug };
  }

  test('AC1: Sarah changes her name and saves; the sidebar footer and the Trainers page of John show it', async ({
    page,
    context,
    browser,
    baseURL,
    appLocale,
    messages: copy,
  }) => {
    const { john, sarah, slug } = await team();
    await signInWithSession(context, sarah);

    await page.goto(`/w/${slug}`);
    const footer = page.getByRole('complementary').locator('footer');
    await expect(footer).toHaveText('Sara');
    await page.getByRole('button', { name: copy.userMenu.label }).click();
    await page.getByRole('link', { name: copy.userMenu.profile }).click();
    await expect(page).toHaveURL(/\/me\/profile$/);
    const name = page.getByLabel(copy.myProfile.nameLabel);
    await expect(name).toHaveValue('Sara');
    // The email address is plain text, not a field.
    await expect(page.getByText(sarah)).toBeVisible();
    await expect(page.getByLabel(copy.myProfile.emailLabel)).toHaveCount(0);
    await expectNoAxeViolations(page, `TW-09 in ${appLocale}`);

    // An invalid name is refused under the field, as typed, and nothing is saved.
    await name.fill('   ');
    await page.getByRole('button', { name: copy.myProfile.save }).click();
    await expect(page.locator('#person-name-error')).toHaveText(copy.myProfile.errors.nameRequired);
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expectNoAxeViolations(page, `TW-09 with a refused name in ${appLocale}`);
    // 120 characters are allowed (F030); one more is refused.
    await name.fill('x'.repeat(121));
    await page.getByRole('button', { name: copy.myProfile.save }).click();
    await expect(page.locator('#person-name-error')).toHaveText(copy.myProfile.errors.nameTooLong);
    expect(((await (await page.request.get('/api/v1/me')).json()) as { name: string }).name).toBe(
      'Sara',
    );

    await name.fill('Sarah de Vries');
    await page.getByRole('button', { name: copy.myProfile.save }).click();
    await expect(page.getByRole('status')).toHaveText(copy.myProfile.saved);
    // The data path: the account holds the new name.
    expect(((await (await page.request.get('/api/v1/me')).json()) as { name: string }).name).toBe(
      'Sarah de Vries',
    );

    await page.goto(`/w/${slug}`);
    await expect(footer).toHaveText('Sarah de Vries');

    const johnsBrowser = await browser.newContext({ baseURL, extraHTTPHeaders: clientIpHeaders() });
    try {
      await signInWithSession(johnsBrowser, john);
      const johnsPage = await johnsBrowser.newPage();
      await johnsPage.goto(`/w/${slug}/trainers`);
      await expect(johnsPage.getByRole('row').nth(2)).toContainText(`Sarah de Vries${sarah}`);
      await expect(johnsPage.getByText('Sara', { exact: true })).toHaveCount(0);
    } finally {
      await johnsBrowser.close();
    }
  });
});

// F005 AC4, AC5 (spec #173): an Owner switches whether they train in a workspace on My profile;
// a Trainer has no switch for a workspace where they are one.
const PERSONAL = 'Sarah Personal Training';

interface Trainer {
  id: string;
  name: string;
}

test.describe('F005 I also train here', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
  });

  test('AC4: John switches training off in his gym and on again; the trainers of the API follow', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const john = newAddress('john');
    await createAccount(john, undefined, 'John');
    await createGymWithTrainer(john, GYM, 'owner');
    await signInWithSession(context, john);
    const workspaceId = (
      (await (await page.request.get('/api/v1/me/workspaces')).json()) as { workspaceId: string }[]
    )[0]?.workspaceId;
    const trainers = async () =>
      (await (
        await page.request.get(`/api/v1/workspaces/${workspaceId}/trainers`)
      ).json()) as Trainer[];

    await page.goto('/me/profile');
    const label = copy.profile.trainsHere.label.replace('{workspace}', GYM);
    const trainsHere = page.getByRole('switch', { name: label });
    // The gym's creator trains from the start.
    await expect(trainsHere).toBeChecked();
    expect((await trainers()).map(({ name }) => name)).toEqual(['John']);
    await expectNoAxeViolations(page, `TW-09 with the switch in ${appLocale}`);

    await trainsHere.uncheck();
    await expect(page.getByRole('status')).toHaveText(copy.profile.trainsHere.saved);
    // The data path: the API no longer lists John, and the switch stays off after a reload.
    expect(await trainers()).toEqual([]);
    await page.reload();
    await expect(trainsHere).not.toBeChecked();
    // Nothing else about John changed.
    expect(((await (await page.request.get('/api/v1/me')).json()) as { name: string }).name).toBe(
      'John',
    );
    await expectNoAxeViolations(page, `TW-09 with the switch off in ${appLocale}`);

    await trainsHere.check();
    await expect(page.getByRole('status')).toHaveText(copy.profile.trainsHere.saved);
    expect((await trainers()).map(({ name }) => name)).toEqual(['John']);
    await page.reload();
    await expect(trainsHere).toBeChecked();
  });

  test("AC5: Sarah has no switch for John's Gym, where she is a Trainer, and one for her own", async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const sarah = newAddress('sarah');
    await createAccount(sarah, undefined, 'Sarah');
    await createGymWithTrainer(sarah, GYM, 'trainer');
    await createGymWithTrainer(sarah, PERSONAL, 'owner', false);
    await signInWithSession(context, sarah);

    await page.goto('/me/profile');

    await expect(page.getByRole('switch')).toHaveCount(1);
    await expect(
      page.getByRole('switch', {
        name: copy.profile.trainsHere.label.replace('{workspace}', PERSONAL),
      }),
    ).not.toBeChecked();
    await expect(
      page.getByRole('switch', { name: copy.profile.trainsHere.label.replace('{workspace}', GYM) }),
    ).toHaveCount(0);
    await expectNoAxeViolations(page, `TW-09 of a Trainer and Owner in ${appLocale}`);
  });
});

// F010: the Language row on My profile (TW-09), the same choice as in the user menu.
test.describe('F010 language on My profile', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
  });

  test('AC1: John chooses the other language on My profile; the page re-renders in place and the account stores it', async ({
    page,
    context,
    appLocale,
    otherLocale,
    messages: copy,
  }) => {
    const john = newAddress('john');
    await createAccount(john, undefined, 'John');
    await createGymWithTrainer(john, GYM, 'owner');
    await signInWithSession(context, john);
    const stored = async () =>
      ((await (await page.request.get('/api/v1/me')).json()) as { preferredLocale: string | null })
        .preferredLocale;
    const ownName = (locale: Locale) =>
      locale === 'en' ? messages.en.userMenu.languageEn : messages['nl-NL'].userMenu.languageNl;

    await page.goto('/me/profile');
    await expect(
      page.getByRole('heading', { level: 2, name: copy.profile.language }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: ownName(appLocale), exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page.getByRole('button', { name: ownName(otherLocale), exact: true }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(await stored()).toBeNull();
    await expectNoAxeViolations(page, `TW-09 with the Language row in ${appLocale}`);

    // A navigation would reload the document; the marker below survives only a re-render.
    await page.evaluate(() => {
      (window as unknown as { __notReloaded: boolean }).__notReloaded = true;
    });
    await page.getByRole('button', { name: ownName(otherLocale), exact: true }).click();

    const other = messages[otherLocale];
    await expect(
      page.getByRole('heading', { level: 1, name: other.myProfile.title }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2, name: other.profile.language }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: ownName(otherLocale), exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('html')).toHaveAttribute('lang', formattingLocales[otherLocale]);
    expect(
      await page.evaluate(() => (window as unknown as { __notReloaded?: boolean }).__notReloaded),
    ).toBe(true);
    // The data path: the account stores it.
    expect(await stored()).toBe(otherLocale);
    await expect(page).toHaveTitle(other.myProfile.title);
    await expectNoAxeViolations(page, `TW-09 after the switch to ${otherLocale}`);
  });

  test('a language that could not be saved stays as it was, and says so', async ({
    page,
    context,
    appLocale,
    otherLocale,
    messages: copy,
  }) => {
    const john = newAddress('john');
    await createAccount(john, undefined, 'John');
    await createGymWithTrainer(john, GYM, 'owner');
    await signInWithSession(context, john);
    await page.goto('/me/profile');
    await page.route('**/api/v1/me', (route) =>
      route.request().method() === 'PATCH' ? route.abort() : route.continue(),
    );
    const ownName = (locale: Locale) =>
      locale === 'en' ? messages.en.userMenu.languageEn : messages['nl-NL'].userMenu.languageNl;

    await page.getByRole('button', { name: ownName(otherLocale), exact: true }).click();

    await expect(page.getByRole('main').getByRole('alert')).toHaveText(copy.userMenu.error);
    await expect(page.locator('html')).toHaveAttribute('lang', formattingLocales[appLocale]);
    await expect(
      page.getByRole('button', { name: ownName(appLocale), exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.unroute('**/api/v1/me');
    const me = (await (await page.request.get('/api/v1/me')).json()) as {
      preferredLocale: string | null;
    };
    expect(me.preferredLocale).toBeNull();
  });
});

// F050 AC6 (spec #492): a team member switches the emails about bookings in their classes off and
// on, on My profile (TW-09). The setting belongs to the account (`bookingEmails` of `/v1/me`).
test.describe('F050 booking emails switch', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
  });

  const stored = async (page: Page) =>
    (await (await page.request.get('/api/v1/me')).json()) as {
      name: string;
      bookingEmails: boolean;
    };

  test('AC6: booking emails switch', async ({ page, context, appLocale, messages: copy }) => {
    const sarah = newAddress('sarah');
    await createAccount(sarah, undefined, 'Sarah');
    await createGymWithTrainer(sarah, GYM, 'trainer');
    await signInWithSession(context, sarah);
    await page.goto('/me/profile');
    const box = page.getByRole('checkbox', { name: copy.myProfile.bookingEmailsLabel });

    // On by default, with its help text and heading.
    await expect(
      page.getByRole('heading', { level: 2, name: copy.myProfile.emailsTitle }),
    ).toBeVisible();
    await expect(box).toBeChecked();
    await expect(box).toHaveAccessibleDescription(copy.myProfile.bookingEmailsHelp);
    expect((await stored(page)).bookingEmails).toBe(true);
    await expectNoAxeViolations(page, `TW-09 with the booking emails box in ${appLocale}`);

    // Reached and toggled with the keyboard.
    await box.focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('status')).toHaveText(copy.myProfile.saved);
    await expect(box).not.toBeChecked();
    // The data path: the account holds the setting, and it is still off after a reload.
    expect((await stored(page)).bookingEmails).toBe(false);
    await page.reload();
    await expect(box).not.toBeChecked();
    await expectNoAxeViolations(page, `TW-09 with the booking emails box off in ${appLocale}`);

    await box.check();
    await expect(page.getByRole('status')).toHaveText(copy.myProfile.saved);
    expect((await stored(page)).bookingEmails).toBe(true);
    await page.reload();
    await expect(box).toBeChecked();
    // Nothing else about Sarah changed.
    expect((await stored(page)).name).toBe('Sarah');
  });

  test('a failed save puts the box back and says so; the name, Ik train hier ook and the email address are unaffected', async ({
    page,
    context,
    messages: copy,
  }) => {
    const sarah = newAddress('sarah');
    await createAccount(sarah, undefined, 'Sarah');
    await createGymWithTrainer(sarah, GYM, 'owner');
    await signInWithSession(context, sarah);
    await page.goto('/me/profile');
    const box = page.getByRole('checkbox', { name: copy.myProfile.bookingEmailsLabel });
    const trainsHere = page.getByRole('switch', {
      name: copy.profile.trainsHere.label.replace('{workspace}', GYM),
    });
    await expect(box).toBeChecked();
    await expect(trainsHere).toBeChecked();
    await page.route('**/api/v1/me', (route) =>
      route.request().method() === 'PATCH' ? route.abort() : route.continue(),
    );

    // `click()`, not `uncheck()`: `uncheck()` re-reads the box after its click and fails when the
    // aborted save has already put the box back (#1290). The alert below proves the click was
    // saved (and failed), the box is asserted checked again afterwards.
    await box.click();

    await expect(page.getByRole('main').getByRole('alert')).toHaveText(
      copy.myProfile.errors.noConnection,
    );
    await expect(box).toBeChecked();
    await expect(page.getByLabel(copy.myProfile.nameLabel)).toHaveValue('Sarah');
    await expect(trainsHere).toBeChecked();
    await expect(trainsHere).toBeEnabled();
    await expect(page.getByText(sarah)).toBeVisible();
    await page.unroute('**/api/v1/me');
    const after = await stored(page);
    expect(after.bookingEmails).toBe(true);
    expect(after.name).toBe('Sarah');
  });
});

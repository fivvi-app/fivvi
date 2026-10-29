import {
  clientIpHeaders,
  createAccount,
  createGymWithTrainer,
  newAddress,
  newAllowedAddress,
  signInWithSession,
} from './accounts';
import { expect, expectNoAxeViolations, test } from './fixtures';
import { signInWithCode } from './sign-in-page';

// F010, TW-08 Settings → Language: the Owner sets the workspace's default communication language.
// Copy comes from the catalogs. Each spec signs in with an address and a visitor IP of its own
// (see workspaces.spec.ts); the seeded account owner@example.com plays the Owner of another
// workspace.
const SEEDED_OWNER = 'owner@example.com';

interface Me {
  preferredLocale: string | null;
  workspaces: { id: string; slug: string }[];
}

test.describe('F010 workspace default language', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
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

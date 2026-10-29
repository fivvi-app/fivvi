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

// F002, TW-11 `/welcome`, the signed-in home and the no-access page. Copy comes from the
// catalogs. Sign-in works as in sign-in.spec.ts: each spec has an address of its own and a visitor
// IP address of its own, and reads the code from the fake Brevo server. The e2e database holds the
// seed: the account owner@example.com (signed in with a session, not a code: see
// `signInWithSession`) owns the workspace John's Gym (`johns-gym`), so a workspace
// that a spec creates under that name gets a number (`johns-gym-2`, …).
const SEEDED_OWNER = 'owner@example.com';
const SEEDED_SLUG = 'johns-gym';
const SLUG_OF_NEW_GYM = /\/w\/johns-gym-\d+$/;
const TOO_LONG = 'x'.repeat(81);

interface Me {
  name: string | null;
  canCreateWorkspace: boolean;
  workspaces: { id: string; name: string; slug: string; role: string }[];
}

test.describe('F002 first run and the signed-in home', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
  });

  test('AC1: first sign-in sets up the workspace and lands in it', async ({
    page,
    appLocale,
    messages: copy,
  }) => {
    const address = newAllowedAddress('sarah');
    await page.goto('/login');
    await signInWithCode(page, copy, address);

    // The signed-in home sends an allowed address without a workspace to TW-11 ...
    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.getByRole('heading', { level: 1, name: copy.welcome.title })).toBeVisible();
    await expect(page.getByLabel(copy.welcome.workspaceNameLabel)).toHaveAccessibleDescription(
      copy.welcome.workspaceNameHint,
    );
    await expectNoAxeViolations(page, `TW-11 in ${appLocale}`);
    // ... and so does any other trainer-web page, even one of somebody else's workspace.
    await page.goto(`/w/${SEEDED_SLUG}`);
    await expect(page).toHaveURL(/\/welcome$/);

    await page.getByLabel(copy.welcome.personNameLabel).fill('Sarah');
    await page.getByLabel(copy.welcome.workspaceNameLabel).fill("John's Gym");
    await page.getByRole('button', { name: copy.welcome.submit }).click();

    await expect(page).toHaveURL(SLUG_OF_NEW_GYM);
    await expect(page.getByRole('heading', { level: 1, name: "John's Gym" })).toBeVisible();
    await expect(page).toHaveTitle("John's Gym");
    // The data path: the account is Sarah, owns the new workspace, and may not set up another.
    const me = (await (await page.request.get('/api/v1/me')).json()) as Me;
    expect(me.name).toBe('Sarah');
    expect(me.canCreateWorkspace).toBe(false);
    expect(me.workspaces).toEqual([
      {
        id: expect.any(String),
        name: "John's Gym",
        slug: expect.stringMatching(/^johns-gym-\d+$/),
        role: 'owner',
      },
    ]);
    // Opening TW-11 again, or the signed-in home, now leads to the workspace (AC4) ...
    for (const path of ['/welcome', '/home']) {
      await page.goto(path);
      await expect(page).toHaveURL(SLUG_OF_NEW_GYM);
    }
    // ... and a slug that is not one of its workspaces leads there too, showing nothing of it.
    await page.goto('/w/no-such-gym');
    await expect(page).toHaveURL(SLUG_OF_NEW_GYM);
  });

  test('AC1: TW-11 asks for the name only when the account has none', async ({
    page,
    messages: copy,
  }) => {
    const address = newAllowedAddress('named');
    // This account has a name already (`createAccount`).
    await createAccount(address);
    await page.goto('/login');
    await signInWithCode(page, copy, address);

    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.getByLabel(copy.welcome.workspaceNameLabel)).toBeVisible();
    await expect(page.getByLabel(copy.welcome.personNameLabel)).toHaveCount(0);
    await page.getByLabel(copy.welcome.workspaceNameLabel).fill('  Studio Zuid  ');
    await page.getByRole('button', { name: copy.welcome.submit }).click();

    await expect(page).toHaveURL(/\/w\/studio-zuid(-\d+)?$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Studio Zuid' })).toBeVisible();
    const me = (await (await page.request.get('/api/v1/me')).json()) as Me;
    expect(me.name).toBe('E2E');
  });

  test('AC3: shows the field error, and nothing is created', async ({
    page,
    appLocale,
    messages: copy,
  }) => {
    const address = newAllowedAddress('typo');
    await page.goto('/login');
    await signInWithCode(page, copy, address);
    await expect(page).toHaveURL(/\/welcome$/);
    const submit = page.getByRole('button', { name: copy.welcome.submit });
    const person = page.getByLabel(copy.welcome.personNameLabel);
    const workspace = page.getByLabel(copy.welcome.workspaceNameLabel);

    // Empty, and only spaces: both fields say what is wrong. The words come from the API's answer.
    await person.fill('   ');
    await submit.click();

    await expect(page.getByText(copy.welcome.errors.personNameRequired)).toBeVisible();
    await expect(page.getByText(copy.welcome.errors.workspaceNameRequired)).toBeVisible();
    await expect(person).toHaveAttribute('aria-invalid', 'true');
    await expect(workspace).toHaveAttribute('aria-invalid', 'true');
    await expect(workspace).toHaveAccessibleDescription(
      new RegExp(copy.welcome.errors.workspaceNameRequired),
    );
    await expectNoAxeViolations(page, `TW-11 with errors in ${appLocale}`);

    // Too long (81 characters): the field says so, and keeps what was typed.
    await person.fill('Sarah');
    await workspace.fill(TOO_LONG);
    await submit.click();

    await expect(page.getByText(copy.welcome.errors.workspaceNameTooLong)).toBeVisible();
    await expect(page.getByText(copy.welcome.errors.workspaceNameRequired)).toHaveCount(0);
    await expect(workspace).toHaveValue(TOO_LONG);
    await expect(page).toHaveURL(/\/welcome$/);
    // The data path: nothing was created, not even the name.
    const me = (await (await page.request.get('/api/v1/me')).json()) as Me;
    expect(me).toMatchObject({ name: null, canCreateWorkspace: true, workspaces: [] });

    // A name the API accepts goes through from the same screen.
    await workspace.fill('Fit Zuid');
    await submit.click();
    await expect(page).toHaveURL(/\/w\/fit-zuid(-\d+)?$/);
  });

  test('AC13: the seeded owner lands in John’s Gym, and /welcome leads back to it', async ({
    context,
    page,
    messages: copy,
  }) => {
    // The seeded account is shared by every run, so it is signed in without an emailed code
    // (`signInWithSession`): its one live code and its three sign-ins per 15 minutes would not
    // hold for parallel projects and retries. AC4 and the sign-in itself use accounts of their own.
    await signInWithSession(context, SEEDED_OWNER);
    await page.goto('/home');

    await expect(page).toHaveURL(new RegExp(`/w/${SEEDED_SLUG}$`));
    await expect(page.getByRole('heading', { level: 1, name: "John's Gym" })).toBeVisible();
    await expect(page.getByText(copy.workspaceHome.description)).toBeVisible();
    await expect(page.getByRole('button', { name: copy.signOut.label })).toBeVisible();
    const me = (await (await page.request.get('/api/v1/me')).json()) as Me;
    expect(me.canCreateWorkspace).toBe(false);
    expect(me.workspaces).toEqual([
      { id: expect.any(String), name: "John's Gym", slug: SEEDED_SLUG, role: 'owner' },
    ]);

    await page.goto('/welcome');
    await expect(page).toHaveURL(new RegExp(`/w/${SEEDED_SLUG}$`));
    // A slug that is not one of its workspaces leads home too, without showing anything of it.
    await page.goto('/w/no-such-gym');
    await expect(page).toHaveURL(new RegExp(`/w/${SEEDED_SLUG}$`));
  });

  test('AC5: an account that may not set up a workspace sees the no-access page, never TW-11', async ({
    page,
    appLocale,
    messages: copy,
  }) => {
    // Not on the sign-up allowlist and with no team role: for example a client.
    const address = newAddress('client');
    await createAccount(address);
    await page.goto('/login');
    await signInWithCode(page, copy, address);

    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole('heading', { level: 1, name: copy.noAccess.title })).toBeVisible();
    await expect(page.getByText(copy.noAccess.body)).toBeVisible();
    await expect(page.getByRole('button', { name: copy.signOut.label })).toBeVisible();
    await expectNoAxeViolations(page, `the no-access page in ${appLocale}`);
    // TW-11 is out of reach: /welcome shows the no-access page, so do other people's workspaces ...
    for (const path of ['/welcome', `/w/${SEEDED_SLUG}`]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/home$/);
      await expect(page.getByText(copy.noAccess.body)).toBeVisible();
      await expect(page.getByText(copy.welcome.title)).toHaveCount(0);
    }
    // ... and the API says no to creating one.
    const created = await page.request.post('/api/v1/workspaces', { data: { name: 'My Gym' } });
    expect(created.status()).toBe(403);
    const me = (await (await page.request.get('/api/v1/me')).json()) as Me;
    expect(me).toMatchObject({ canCreateWorkspace: false, workspaces: [] });

    await page.getByRole('button', { name: copy.signOut.label }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('AC9: anonymous /welcome and /w/{slug} go to sign-in', async ({ page, messages: copy }) => {
    await page.goto('/welcome');
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fwelcome$/);
    await expect(page.getByRole('heading', { level: 1, name: copy.signIn.title })).toBeVisible();

    await page.goto(`/w/${SEEDED_SLUG}`);
    await expect(page).toHaveURL(new RegExp(`/login\\?returnTo=%2Fw%2F${SEEDED_SLUG}$`));
  });
});

test.describe('F002 renaming the workspace (TW-08)', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
  });

  test('AC6: the Owner renames the workspace, every page shows the new name and the slug stays', async ({
    page,
    appLocale,
    messages: copy,
  }) => {
    const address = newAllowedAddress('renamer');
    await page.goto('/login');
    await signInWithCode(page, copy, address);
    await page.getByLabel(copy.welcome.personNameLabel).fill('Sarah');
    await page.getByLabel(copy.welcome.workspaceNameLabel).fill("John's Gym");
    await page.getByRole('button', { name: copy.welcome.submit }).click();
    await expect(page).toHaveURL(SLUG_OF_NEW_GYM);
    const home = new URL(page.url()).pathname;
    const slug = home.replace('/w/', '');

    // Settings are in the Owner's navigation, and show the URL name and time zone read-only.
    await page.getByRole('link', { name: copy.workspaceNav.settings }).click();
    await expect(page).toHaveURL(`${home}/settings/general`);
    await expect(
      page.getByRole('heading', { level: 1, name: copy.settingsGeneral.title }),
    ).toBeVisible();
    await expect(page.getByLabel(copy.settingsGeneral.nameLabel)).toHaveValue("John's Gym");
    await expect(page.getByText(slug, { exact: true })).toBeVisible();
    await expect(page.getByText('Europe/Amsterdam')).toBeVisible();
    await expectNoAxeViolations(page, `TW-08 in ${appLocale}`);

    // AC3: a blank and a too long name are refused with a field error, and nothing changes.
    const field = page.getByLabel(copy.settingsGeneral.nameLabel);
    const save = page.getByRole('button', { name: copy.settingsGeneral.save });
    await field.fill('   ');
    await save.click();
    await expect(page.getByText(copy.settingsGeneral.errors.nameRequired)).toBeVisible();
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    // The pointer stays on the button after the click; axe judges the button at rest.
    await page.mouse.move(0, 0);
    await expectNoAxeViolations(page, `TW-08 with an error in ${appLocale}`);
    await field.fill(TOO_LONG);
    await save.click();
    await expect(page.getByText(copy.settingsGeneral.errors.nameTooLong)).toBeVisible();
    await expect(field).toHaveValue(TOO_LONG);
    const unchanged = (await (await page.request.get('/api/v1/me')).json()) as Me;
    expect(unchanged.workspaces[0]?.name).toBe("John's Gym");

    // The rename: the sidebar shows the new name without a reload.
    await field.fill("John's Gym Utrecht");
    await save.click();
    await expect(page.getByText(copy.settingsGeneral.saved)).toBeVisible();
    await expect(page.getByRole('complementary')).toContainText("John's Gym Utrecht");
    // The data path: the API holds the new name, and the slug is the one it always was.
    const me = (await (await page.request.get('/api/v1/me')).json()) as Me;
    expect(me.workspaces).toEqual([
      { id: expect.any(String), name: "John's Gym Utrecht", slug, role: 'owner' },
    ]);
    // Every page shows it: the home of the workspace, at the same address.
    await page.goto(home);
    await expect(page.getByRole('heading', { level: 1, name: "John's Gym Utrecht" })).toBeVisible();
    await expect(page).toHaveTitle("John's Gym Utrecht");
    await expect(page.getByRole('complementary')).toContainText("John's Gym Utrecht");
  });

  test('AC7: a Trainer has no Settings, sees the no-permission page, and the rename answers 403', async ({
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
    await expect(page.getByRole('heading', { level: 1, name: "John's Gym" })).toBeVisible();
    await expect(page.getByRole('link', { name: copy.workspaceNav.settings })).toHaveCount(0);

    await page.goto(`/w/${slug}/settings/general`);
    await expect(
      page.getByRole('heading', { level: 1, name: copy.noPermission.title }),
    ).toBeVisible();
    await expect(
      page.getByText(copy.noPermission.body.replace('{workspace}', "John's Gym")),
    ).toBeVisible();
    await expect(page.getByLabel(copy.settingsGeneral.nameLabel)).toHaveCount(0);
    await expectNoAxeViolations(page, `the no-permission page in ${appLocale}`);

    // The API says no as well, and the name is what it was.
    const me = (await (await page.request.get('/api/v1/me')).json()) as Me;
    const workspace = me.workspaces[0];
    if (!workspace) throw new Error('The Trainer has no workspace.');
    const renamed = await page.request.patch(`/api/v1/workspaces/${workspace.id}`, {
      data: { name: 'Hijacked' },
    });
    expect(renamed.status()).toBe(403);
    const read = await page.request.get(`/api/v1/workspaces/${workspace.id}`);
    expect(read.status()).toBe(200);
    expect(((await read.json()) as { name: string }).name).toBe("John's Gym");
  });

  test('AC9: anonymous gets 401 on the workspace routes and the settings go to sign-in', async ({
    page,
  }) => {
    const id = '0197c0de-0000-7000-8000-0000000000a1';
    expect((await page.request.get(`/api/v1/workspaces/${id}`)).status()).toBe(401);
    expect(
      (await page.request.patch(`/api/v1/workspaces/${id}`, { data: { name: 'X' } })).status(),
    ).toBe(401);

    await page.goto(`/w/${SEEDED_SLUG}/settings/general`);
    await expect(page).toHaveURL(/\/login\?returnTo=/);
  });
});

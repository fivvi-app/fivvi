import type { Page } from '@playwright/test';
import {
  clientIpHeaders,
  createAccount,
  createGymWithTrainer,
  joinTeam,
  leaveTeam,
  newAddress,
  newAllowedAddress,
  signInWithSession,
} from './accounts';
import { expect, expectNoAxeViolations, test } from './fixtures';

// F012 (spec #423): the scope switcher in the sidebar header, the role home, the workspace this
// browser remembers and Nieuwe werkruimte. Copy comes from the catalogs. Each spec has accounts and
// workspaces of its own (see language.spec.ts): Sarah is a Trainer of John's Gym and the Owner of
// Sarah Personal Training, as in the seed; John owns John's Gym only; Pilot is on the sign-up
// allowlist (`newAllowedAddress`).
const GYM = "John's Gym";
const PERSONAL = 'Sarah Personal Training';

test.describe('F012 the scope switcher on the web', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
  });

  /** Sarah: Trainer of John's Gym (owned by John, with Tom as a second Trainer) and Owner of her own workspace. */
  async function sarahOnTwoTeams() {
    const john = newAddress('john');
    const sarah = newAddress('sarah');
    const tom = newAddress('tom');
    await createAccount(john, undefined, 'John');
    await createAccount(sarah, undefined, 'Sarah');
    await createAccount(tom, undefined, 'Tom');
    const gymSlug = await createGymWithTrainer(john, GYM, 'owner');
    await joinTeam(sarah, gymSlug, 'trainer');
    await joinTeam(tom, gymSlug, 'trainer');
    const personalSlug = await createGymWithTrainer(sarah, PERSONAL, 'owner');
    return { john, sarah, tom, gymSlug, personalSlug };
  }

  const switcher = (page: Page, label: string) => page.getByRole('button', { name: label });

  test('AC1: the switcher lists my workspaces with my role, the current one checked', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const { sarah, gymSlug } = await sarahOnTwoTeams();
    await signInWithSession(context, sarah);
    await page.goto(`/w/${gymSlug}`);

    const trigger = switcher(page, `${GYM} · ${copy.roles.trainer}`);
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger).toBeEnabled();
    await trigger.click();

    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const menu = page.getByRole('menu', { name: `${GYM} · ${copy.roles.trainer}` });
    const rows = menu.getByRole('menuitemradio');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toHaveAccessibleName(`${GYM} · ${copy.roles.trainer}`);
    await expect(rows.nth(0)).toHaveAttribute('aria-checked', 'true');
    await expect(rows.nth(1)).toHaveAccessibleName(`${PERSONAL} · ${copy.roles.owner}`);
    await expect(rows.nth(1)).toHaveAttribute('aria-checked', 'false');
    // Not on the allowlist: no way to create a workspace, and no other workspace is listed.
    await expect(menu.getByRole('menuitem')).toHaveCount(0);
    await expectNoAxeViolations(page, `the open scope switcher in ${appLocale}`);
  });

  test('the switcher works by keyboard: Enter opens, the arrow keys move, Escape closes and returns to the button', async ({
    page,
    context,
    messages: copy,
  }) => {
    const { sarah, gymSlug, personalSlug } = await sarahOnTwoTeams();
    await signInWithSession(context, sarah);
    await page.goto(`/w/${gymSlug}`);
    const trigger = switcher(page, `${GYM} · ${copy.roles.trainer}`);
    await expect(trigger).toBeEnabled();

    await trigger.focus();
    await page.keyboard.press('Enter');
    const menu = page.getByRole('menu', { name: `${GYM} · ${copy.roles.trainer}` });
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(menu).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(menu.getByRole('menuitemradio').nth(1)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(`/w/${personalSlug}`);
  });

  test("AC2, AC11: picking Sarah Personal Training opens its Owner home, with its navigation and only its data; John's Gym has no Trainers or Settings for Sarah", async ({
    page,
    context,
    messages: copy,
  }) => {
    const { sarah, gymSlug, personalSlug } = await sarahOnTwoTeams();
    await signInWithSession(context, sarah);
    // The data path: a client in each workspace; each list shows its own.
    const workspaces = (await (await page.request.get('/api/v1/me/workspaces')).json()) as {
      workspaceId: string;
      slug: string;
    }[];
    const idOf = (slug: string) =>
      workspaces.find((workspace) => workspace.slug === slug)?.workspaceId;
    for (const [slug, name] of [
      [gymSlug, 'Anna de Vries'],
      [personalSlug, 'Mark Jansen'],
    ] as const) {
      const created = await page.request.post(`/api/v1/workspaces/${idOf(slug)}/clients`, {
        data: { name, email: `${name.split(' ')[0]?.toLowerCase()}@example.com` },
      });
      expect(created.status()).toBe(201);
    }

    await page.goto(`/w/${gymSlug}`);
    const nav = page.getByRole('navigation', { name: copy.workspaceNav.label });
    await expect(nav.getByRole('link', { name: copy.workspaceNav.clients })).toBeVisible();
    await expect(nav.getByRole('link', { name: copy.workspaceNav.trainers })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: copy.workspaceNav.settings })).toHaveCount(0);
    await nav.getByRole('link', { name: copy.workspaceNav.clients }).click();
    await expect(page.getByText('Anna de Vries')).toBeVisible();
    await expect(page.getByText('Mark Jansen')).toHaveCount(0);

    const switched = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/v1/workspaces/${idOf(personalSlug)}/switched`) &&
        response.request().method() === 'POST',
    );
    await switcher(page, `${GYM} · ${copy.roles.trainer}`).click();
    await page.getByRole('menuitemradio', { name: `${PERSONAL} · ${copy.roles.owner}` }).click();

    await expect(page).toHaveURL(`/w/${personalSlug}`);
    expect((await switched).status()).toBe(204);
    await expect(page.getByRole('heading', { level: 1, name: PERSONAL })).toBeVisible();
    await expect(switcher(page, `${PERSONAL} · ${copy.roles.owner}`)).toBeVisible();
    await expect(nav.getByRole('link', { name: copy.workspaceNav.trainers })).toBeVisible();
    await expect(nav.getByRole('link', { name: copy.workspaceNav.settings })).toBeVisible();
    await nav.getByRole('link', { name: copy.workspaceNav.clients }).click();
    await expect(page.getByText('Mark Jansen')).toBeVisible();
    await expect(page.getByText('Anna de Vries')).toHaveCount(0);
    await nav.getByRole('link', { name: copy.workspaceNav.trainers }).click();
    await expect(page.getByText('Tom')).toHaveCount(0);
  });

  test('AC3: one workspace, not allowlisted: the header is a plain label with no menu', async ({
    page,
    context,
    messages: copy,
  }) => {
    const john = newAddress('john');
    await createAccount(john, undefined, 'John');
    const slug = await createGymWithTrainer(john, GYM, 'owner');
    await signInWithSession(context, john);

    await page.goto(`/w/${slug}`);

    await expect(page.getByText(`${GYM} · ${copy.roles.owner}`)).toBeVisible();
    await expect(page.locator('aside [aria-haspopup="menu"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: `${GYM} · ${copy.roles.owner}` })).toHaveCount(0);
  });

  test('AC4, AC10: after using Sarah Personal Training the signed-in home opens it again, and the interface language stays', async ({
    page,
    context,
    messages: copy,
  }) => {
    const { sarah, gymSlug, personalSlug } = await sarahOnTwoTeams();
    await signInWithSession(context, sarah);
    // Nothing remembered yet: the first by name.
    await page.goto('/home');
    await expect(page).toHaveURL(`/w/${gymSlug}`);
    const language = await page.locator('html').getAttribute('lang');

    await switcher(page, `${GYM} · ${copy.roles.trainer}`).click();
    await page.getByRole('menuitemradio', { name: `${PERSONAL} · ${copy.roles.owner}` }).click();
    await expect(page).toHaveURL(`/w/${personalSlug}`);
    await expect(page.getByRole('heading', { level: 1, name: PERSONAL })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', language ?? '');
    await expect(page.getByRole('link', { name: copy.workspaceNav.clients })).toBeVisible();

    // The browser remembers it, whatever the way back in.
    await page.goto('/home');
    await expect(page).toHaveURL(`/w/${personalSlug}`);
    await page.goto('/welcome');
    await expect(page).toHaveURL(`/w/${personalSlug}`);
    // Per browser: the cookie holds the URL name and nothing else, and the account stores nothing.
    const cookie = (await context.cookies()).find(({ name }) => name === 'fivvi_last_workspace');
    expect(cookie?.value).toBe(personalSlug);
    const me = (await (await page.request.get('/api/v1/me')).json()) as Record<string, unknown>;
    expect(Object.keys(me).sort()).toEqual(
      ['canCreateWorkspace', 'email', 'id', 'name', 'preferredLocale', 'workspaces'].sort(),
    );
  });

  test('AC5: a remembered workspace Sarah was removed from is skipped silently; with none left, the no-access page', async ({
    page,
    context,
    messages: copy,
  }) => {
    const { sarah, gymSlug, personalSlug } = await sarahOnTwoTeams();
    await signInWithSession(context, sarah);
    await page.goto(`/w/${personalSlug}`);
    await expect(page.getByRole('heading', { level: 1, name: PERSONAL })).toBeVisible();
    await page.goto('/home');
    await expect(page).toHaveURL(`/w/${personalSlug}`);

    await leaveTeam(sarah, personalSlug);
    await page.goto('/home');
    await expect(page).toHaveURL(`/w/${gymSlug}`);
    await expect(page.getByRole('heading', { level: 1, name: GYM })).toBeVisible();

    await leaveTeam(sarah, gymSlug);
    await page.goto('/home');
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole('heading', { level: 1, name: copy.noAccess.title })).toBeVisible();
  });

  test('AC8: Pilot sees New workspace, also with one workspace, and creates and opens Pilot Two', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const pilot = newAllowedAddress('pilot');
    await createAccount(pilot, undefined, 'Pilot');
    const slug = await createGymWithTrainer(pilot, "Pilot's Gym", 'owner');
    await signInWithSession(context, pilot);
    await page.goto(`/w/${slug}`);

    const trigger = switcher(page, `Pilot's Gym · ${copy.roles.owner}`);
    await expect(trigger).toBeEnabled();
    await trigger.click();
    const menu = page.getByRole('menu', { name: `Pilot's Gym · ${copy.roles.owner}` });
    await expect(menu.getByRole('menuitemradio')).toHaveCount(1);
    await expectNoAxeViolations(page, `the switcher of an allowlisted account in ${appLocale}`);
    await menu.getByRole('menuitem', { name: copy.workspaceSwitcher.newWorkspace }).click();

    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.getByRole('heading', { level: 1, name: copy.welcome.title })).toBeVisible();
    await page.getByLabel(copy.welcome.workspaceNameLabel).fill('Pilot Two');
    await page.getByRole('button', { name: copy.welcome.submit }).click();

    await expect(page).toHaveURL(/\/w\/pilot-two(-\d+)?$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Pilot Two' })).toBeVisible();
    await expect(switcher(page, `Pilot Two · ${copy.roles.owner}`)).toBeVisible();
    const me = (await (await page.request.get('/api/v1/me')).json()) as {
      workspaces: { name: string; role: string }[];
    };
    expect(me.workspaces.map(({ name, role }) => ({ name, role }))).toEqual([
      { name: 'Pilot Two', role: 'owner' },
      { name: "Pilot's Gym", role: 'owner' },
    ]);
  });
});

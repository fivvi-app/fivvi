import { formattingLocales } from '@fivvi/i18n';
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

// F004 (spec #172): the web follows the capabilities the API lists. Navigation by role, the
// no-permission page and the role menu on Trainers (TW-06). Copy comes from the catalogs. Each
// spec has accounts and workspaces of its own (see language.spec.ts). John owns John's Gym, Sarah
// is a Trainer there and Owner of Sarah Personal Training, Mike owns Fit Studio.
const GYM = "John's Gym";
const PERSONAL = 'Sarah Personal Training';

interface TeamMember {
  id: string;
  name: string;
  role: string;
}

test.describe('F004 roles on the web', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
  });

  /** John (Owner) and Sarah (Trainer) of John's Gym, and Mike (Owner) of Fit Studio. */
  async function team() {
    const john = newAddress('john');
    const sarah = newAddress('sarah');
    const mike = newAddress('mike');
    await createAccount(john, undefined, 'John');
    await createAccount(sarah, undefined, 'Sarah');
    await createAccount(mike, undefined, 'Mike');
    const slug = await createGymWithTrainer(john, GYM, 'owner');
    await joinTeam(sarah, slug, 'trainer');
    await createGymWithTrainer(mike, 'Fit Studio', 'owner');
    return { john, sarah, mike, slug };
  }

  /** The workspace ID and the team of the workspace as the API holds it, for the signed-in page. */
  async function teamOf(page: Page, name: string) {
    const workspaces = (await (await page.request.get('/api/v1/me/workspaces')).json()) as {
      workspaceId: string;
      name: string;
    }[];
    const workspaceId = workspaces.find((workspace) => workspace.name === name)?.workspaceId;
    if (!workspaceId) throw new Error(`No workspace ${name}.`);
    const members = (await (
      await page.request.get(`/api/v1/workspaces/${workspaceId}/team-members`)
    ).json()) as TeamMember[];
    return { workspaceId, members };
  }

  test('AC2: John sees Trainers and Settings, and every owner action works', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const { john, slug } = await team();
    await signInWithSession(context, john);

    await page.goto(`/w/${slug}`);
    const nav = page.getByRole('navigation', { name: copy.workspaceNav.label });
    await expect(nav.getByRole('link', { name: copy.workspaceNav.trainers })).toBeVisible();
    await expect(
      nav.getByRole('link', { name: copy.workspaceNav.settings, exact: true }),
    ).toBeVisible();
    await expectNoAxeViolations(page, `the Owner's navigation in ${appLocale}`);

    // The team: the Trainer has a role menu and a remove action.
    await nav.getByRole('link', { name: copy.workspaceNav.trainers }).click();
    await expect(page).toHaveURL(`/w/${slug}/trainers`);
    await expect(page.getByLabel(copy.team.roleMenu.replace('{name}', 'Sarah'))).toBeVisible();
    await expect(page.getByRole('button', { name: copy.team.remove })).toBeVisible();

    // Settings: rename the workspace and set the default language.
    await nav.getByRole('link', { name: copy.workspaceNav.settingsGeneral }).click();
    await expect(page).toHaveURL(`/w/${slug}/settings/general`);
    await page.getByLabel(copy.settingsGeneral.nameLabel).fill("John's Gym Utrecht");
    await page.getByRole('button', { name: copy.settingsGeneral.save }).click();
    await expect(page.getByText(copy.settingsGeneral.saved)).toBeVisible();
    await expect(page.getByText(`John's Gym Utrecht · ${copy.roles.owner}`)).toBeVisible();

    await nav.getByRole('link', { name: copy.workspaceNav.settingsLanguage }).click();
    await expect(page).toHaveURL(`/w/${slug}/settings/language`);
    await page.getByLabel(copy.settingsLanguage.optionEn).check();
    await page.getByRole('button', { name: copy.settingsLanguage.save }).click();
    await expect(page.getByText(copy.settingsLanguage.saved)).toBeVisible();
    await page.reload();
    await expect(page.getByLabel(copy.settingsLanguage.optionEn)).toBeChecked();
  });

  test('AC3: Sarah has no Trainers or Settings in her navigation, and their URLs show the no-permission page naming John’s Gym', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const { sarah, slug } = await team();
    await signInWithSession(context, sarah);

    await page.goto(`/w/${slug}`);
    await expect(page.getByText(`${GYM} · ${copy.roles.trainer}`)).toBeVisible();
    const nav = page.getByRole('navigation', { name: copy.workspaceNav.label });
    await expect(nav.getByRole('link')).toHaveCount(0);
    await expectNoAxeViolations(page, `the Trainer's navigation in ${appLocale}`);

    for (const path of ['trainers', 'settings/general', 'settings/language']) {
      await page.goto(`/w/${slug}/${path}`);
      await expect(
        page.getByRole('heading', { level: 1, name: copy.noPermission.title }),
      ).toBeVisible();
      await expect(
        page.getByText(copy.noPermission.body.replace('{workspace}', GYM)),
      ).toBeVisible();
      await expectNoAxeViolations(page, `the no-permission page of /${path} in ${appLocale}`);
    }
  });

  test('AC4, AC5: John makes Sarah an Owner after confirming, and back; her label changes everywhere; the last Owner has no role menu', async ({
    page,
    context,
    browser,
    baseURL,
    appLocale,
    messages: copy,
  }) => {
    const { john, sarah, slug } = await team();
    await signInWithSession(context, john);
    const sarahsBrowser = await browser.newContext({
      baseURL,
      locale: formattingLocales[appLocale],
      extraHTTPHeaders: clientIpHeaders(),
    });
    try {
      await signInWithSession(sarahsBrowser, sarah);
      const sarahsPage = await sarahsBrowser.newPage();
      await sarahsPage.goto(`/w/${slug}`);
      await expect(sarahsPage.getByText(`${GYM} · ${copy.roles.trainer}`)).toBeVisible();

      await page.goto(`/w/${slug}/trainers`);
      const menuOf = (name: string) => page.getByLabel(copy.team.roleMenu.replace('{name}', name));
      // AC5: John is the only Owner, so his row offers no way to make him a Trainer.
      await expect(menuOf('John')).toHaveCount(0);
      await expect(menuOf('Sarah')).toHaveValue('trainer');
      await expect(menuOf('Sarah').locator('option')).toHaveText([
        copy.roles.owner,
        copy.roles.trainer,
      ]);
      const { workspaceId, members } = await teamOf(page, GYM);
      const johnsId = members.find(({ name }) => name === 'John')?.id;
      const refused = await page.request.patch(
        `/api/v1/workspaces/${workspaceId}/team-members/${johnsId}`,
        { data: { role: 'trainer' } },
      );
      expect(refused.status()).toBe(409);
      expect((await teamOf(page, GYM)).members.map(({ role }) => role)).toEqual([
        'owner',
        'trainer',
      ]);

      // Making Sarah an Owner asks once; cancelling changes nothing.
      await menuOf('Sarah').selectOption('owner');
      const dialog = page.getByRole('alertdialog');
      await expect(
        dialog.getByRole('heading', {
          name: copy.team.makeOwnerDialog.title.replace('{name}', 'Sarah'),
        }),
      ).toBeVisible();
      await expect(
        dialog.getByText(copy.team.makeOwnerDialog.body.replace('{workspace}', GYM)),
      ).toBeVisible();
      await expectNoAxeViolations(page, `the make-owner dialog in ${appLocale}`);
      await dialog.getByRole('button', { name: copy.team.makeOwnerDialog.cancel }).click();
      await expect(dialog).toHaveCount(0);
      await expect(menuOf('Sarah')).toHaveValue('trainer');

      await menuOf('Sarah').selectOption('owner');
      await dialog.getByRole('button', { name: copy.team.makeOwnerDialog.confirm }).click();
      await expect(page.getByRole('status')).toHaveText(
        copy.team.roleChanged.owner.replace('{name}', 'Sarah'),
      );
      // The title streams in after the body of the refresh (#353, #354), and axe wants one.
      await expect(page).toHaveTitle(copy.team.title);
      await expect(menuOf('Sarah')).toHaveValue('owner');
      await expectNoAxeViolations(page, `TW-06 after a role change in ${appLocale}`);

      // The data path: the API holds Sarah as an Owner, and her next request has the capabilities.
      expect((await teamOf(page, GYM)).members.map(({ role }) => role)).toEqual(['owner', 'owner']);
      await sarahsPage.reload();
      await expect(sarahsPage.getByText(`${GYM} · ${copy.roles.owner}`)).toBeVisible();
      const sarahsNav = sarahsPage.getByRole('navigation', { name: copy.workspaceNav.label });
      await expect(sarahsNav.getByRole('link', { name: copy.workspaceNav.trainers })).toBeVisible();
      await expect(
        sarahsNav.getByRole('link', { name: copy.workspaceNav.settings, exact: true }),
      ).toBeVisible();
      await sarahsPage.goto('/me/profile');
      await expect(sarahsPage.getByRole('listitem')).toHaveText(`${GYM}${copy.roles.owner}`);
      await sarahsPage.goto(`/w/${slug}/trainers`);
      await expect(sarahsPage.getByRole('row').nth(2)).toContainText(copy.roles.owner);

      // Making an Owner a Trainer again needs no dialog.
      await menuOf('Sarah').selectOption('trainer');
      await expect(page.getByRole('status')).toHaveText(
        copy.team.roleChanged.trainer.replace('{name}', 'Sarah'),
      );
      await expect(page).toHaveTitle(copy.team.title);
      await expect(menuOf('Sarah')).toHaveValue('trainer');
      await expect(menuOf('John')).toHaveCount(0);
      expect((await teamOf(page, GYM)).members.map(({ role }) => role)).toEqual([
        'owner',
        'trainer',
      ]);
      await sarahsPage.goto(`/w/${slug}`);
      await expect(sarahsPage.getByText(`${GYM} · ${copy.roles.trainer}`)).toBeVisible();
      await expect(sarahsPage.getByRole('navigation').getByRole('link')).toHaveCount(0);
      await sarahsPage.goto(`/w/${slug}/trainers`);
      await expect(
        sarahsPage.getByRole('heading', { level: 1, name: copy.noPermission.title }),
      ).toBeVisible();
    } finally {
      await sarahsBrowser.close();
    }
  });

  test('AC4: an Owner who makes themselves a Trainer confirms first, and then has the Trainer navigation', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const { john, slug } = await team();
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}/trainers`);
    // Two Owners, so John's row has a menu.
    const { workspaceId, members } = await teamOf(page, GYM);
    const sarahsId = members.find(({ name }) => name === 'Sarah')?.id;
    const promoted = await page.request.patch(
      `/api/v1/workspaces/${workspaceId}/team-members/${sarahsId}`,
      { data: { role: 'owner' } },
    );
    expect(promoted.status()).toBe(200);
    await page.reload();

    const menu = page.getByLabel(copy.team.roleMenu.replace('{name}', 'John'));
    await menu.selectOption('trainer');
    const dialog = page.getByRole('alertdialog');
    await expect(
      dialog.getByRole('heading', { name: copy.team.stepDownDialog.title }),
    ).toBeVisible();
    await expect(
      dialog.getByText(copy.team.stepDownDialog.body.replace('{workspace}', GYM)),
    ).toBeVisible();
    await expectNoAxeViolations(page, `the step-down dialog in ${appLocale}`);
    await dialog.getByRole('button', { name: copy.team.stepDownDialog.cancel }).click();
    await expect(menu).toHaveValue('owner');

    await menu.selectOption('trainer');
    await dialog.getByRole('button', { name: copy.team.stepDownDialog.confirm }).click();

    // John is a Trainer now: the same page shows the no-permission page, and the frame his role.
    await expect(
      page.getByRole('heading', { level: 1, name: copy.noPermission.title }),
    ).toBeVisible();
    await expect(page.getByText(`${GYM} · ${copy.roles.trainer}`)).toBeVisible();
    await expect(page.getByRole('navigation').getByRole('link')).toHaveCount(0);
    await expect(page).toHaveTitle(copy.team.title);
    await expectNoAxeViolations(page, `the no-permission page after stepping down in ${appLocale}`);
  });

  test('AC8: Sarah has Owner navigation in Sarah Personal Training and Trainer navigation in John’s Gym', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const sarah = newAddress('sarah');
    await createAccount(sarah, undefined, 'Sarah');
    const gymSlug = await createGymWithTrainer(sarah, GYM, 'trainer');
    const personalSlug = await createGymWithTrainer(sarah, PERSONAL, 'owner');
    await signInWithSession(context, sarah);
    const nav = page.getByRole('navigation', { name: copy.workspaceNav.label });

    await page.goto(`/w/${gymSlug}`);
    await expect(page.getByText(`${GYM} · ${copy.roles.trainer}`)).toBeVisible();
    await expect(nav.getByRole('link')).toHaveCount(0);

    await page.goto(`/w/${personalSlug}`);
    await expect(page.getByText(`${PERSONAL} · ${copy.roles.owner}`)).toBeVisible();
    await expect(nav.getByRole('link', { name: copy.workspaceNav.trainers })).toBeVisible();
    await expect(
      nav.getByRole('link', { name: copy.workspaceNav.settings, exact: true }),
    ).toBeVisible();
    await expectNoAxeViolations(
      page,
      `the Owner's navigation of the second workspace in ${appLocale}`,
    );

    // The data path: the capabilities the API lists differ per workspace.
    const listed = (await (await page.request.get('/api/v1/me/workspaces')).json()) as {
      name: string;
      role: string;
      capabilities: string[];
    }[];
    expect(listed.find(({ name }) => name === GYM)?.capabilities).not.toContain('team.view');
    expect(listed.find(({ name }) => name === PERSONAL)?.capabilities).toContain('team.manage');

    await page.goto('/me/profile');
    const items = page.getByRole('listitem');
    await expect(items.nth(0)).toHaveText(`${GYM}${copy.roles.trainer}`);
    await expect(items.nth(1)).toHaveText(`${PERSONAL}${copy.roles.owner}`);
  });
});

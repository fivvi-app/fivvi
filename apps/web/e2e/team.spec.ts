import { formattingLocales } from '@fivvi/i18n';
import {
  clientIpHeaders,
  createAccount,
  createGymWithTrainer,
  joinTeam,
  newAddress,
  signInWithSession,
} from './accounts';
import { expect, expectNoAxeViolations, test } from './fixtures';

// F003 (spec #171): My profile (TW-09), the role in the sidebar header and Trainers (TW-06). Copy comes from the
// catalogs. Each spec has accounts and workspaces of its own (see language.spec.ts: the seeded
// accounts are shared, and a stored language would change what they see): Sarah is a Trainer of
// a workspace named John's Gym and the Owner of Sarah Personal Training, as in the seed.
const GYM = "John's Gym";
const PERSONAL = 'Sarah Personal Training';

interface MyWorkspace {
  workspaceId: string;
  name: string;
  slug: string;
  role: string;
}

test.describe('F003 my workspaces and the role in the header', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
  });

  test('AC9: My profile lists both workspaces of Sarah with their role labels, and the pages keep them apart', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const sarah = newAddress('sarah');
    await createAccount(sarah);
    const gymSlug = await createGymWithTrainer(sarah, GYM, 'trainer');
    const personalSlug = await createGymWithTrainer(sarah, PERSONAL, 'owner');
    await signInWithSession(context, sarah);

    // The data path: the page shows what the API holds.
    const listed = (await (
      await page.request.get('/api/v1/me/workspaces')
    ).json()) as MyWorkspace[];
    expect(listed.map(({ name, slug, role }) => ({ name, slug, role }))).toEqual([
      { name: GYM, slug: gymSlug, role: 'trainer' },
      { name: PERSONAL, slug: personalSlug, role: 'owner' },
    ]);

    await page.goto(`/w/${gymSlug}`);
    await page.getByRole('button', { name: copy.userMenu.label }).click();
    await page.getByRole('link', { name: copy.userMenu.profile }).click();
    await expect(page).toHaveURL(/\/me\/profile$/);
    await expect(page.getByRole('heading', { level: 1, name: copy.myProfile.title })).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2, name: copy.myProfile.workspacesTitle }),
    ).toBeVisible();
    const items = page.getByRole('listitem');
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toHaveText(`${GYM}${copy.roles.trainer}`);
    await expect(items.nth(1)).toHaveText(`${PERSONAL}${copy.roles.owner}`);
    await expectNoAxeViolations(page, `TW-09 in ${appLocale}`);

    // Nothing from one workspace shows in the pages of the other.
    await page.goto(`/w/${gymSlug}`);
    await expect(page.getByText(`${GYM} · ${copy.roles.trainer}`)).toBeVisible();
    await expect(page.getByText(PERSONAL)).toHaveCount(0);
    await page.goto(`/w/${personalSlug}`);
    await expect(page.getByText(`${PERSONAL} · ${copy.roles.owner}`)).toBeVisible();
    await expect(page.getByText(GYM)).toHaveCount(0);
  });

  test('the sidebar header shows the workspace name and the role label', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const john = newAddress('john');
    await createAccount(john);
    const slug = await createGymWithTrainer(john, GYM, 'owner');
    await signInWithSession(context, john);

    await page.goto(`/w/${slug}`);

    await expect(page.getByText(`${GYM} · ${copy.roles.owner}`)).toBeVisible();
    await expectNoAxeViolations(page, `the header of an Owner in ${appLocale}`);
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

  test('AC2: John sees John and Sarah with names, email addresses and role labels, and only his gym', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const { john, sarah, slug } = await team();
    await signInWithSession(context, john);

    await page.goto(`/w/${slug}`);
    await page.getByRole('link', { name: copy.workspaceNav.trainers }).click();

    await expect(page).toHaveURL(`/w/${slug}/trainers`);
    await expect(page).toHaveTitle(copy.team.title);
    await expect(page.getByRole('heading', { level: 1, name: copy.team.title })).toBeVisible();
    const rows = page.getByRole('row');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(1)).toContainText(`John${john}${copy.roles.owner}`);
    await expect(rows.nth(2)).toContainText(`Sarah${sarah}${copy.roles.trainer}`);
    await expect(page.getByText('Mike')).toHaveCount(0);
    // The Owner's row has no action; a Trainer's has; nothing adds people (invitations are F011).
    await expect(rows.nth(1).getByRole('button')).toHaveCount(0);
    await expect(rows.nth(2).getByRole('button', { name: copy.team.remove })).toBeVisible();
    await expect(page.getByRole('main').getByRole('link')).toHaveCount(0);
    await expectNoAxeViolations(page, `TW-06 in ${appLocale}`);
  });

  test('AC3: Sarah has no Trainers in her navigation and the URL shows the no-permission page', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const { sarah, slug } = await team();
    await signInWithSession(context, sarah);

    await page.goto(`/w/${slug}`);
    await expect(page.getByRole('link', { name: copy.workspaceNav.trainers })).toHaveCount(0);

    await page.goto(`/w/${slug}/trainers`);
    await expect(
      page.getByRole('heading', { level: 1, name: copy.noPermission.title }),
    ).toBeVisible();
    await expect(page.getByText(sarah)).toHaveCount(0);
    await expectNoAxeViolations(page, `TW-06 for a Trainer in ${appLocale}`);
  });

  test('AC4, AC6: John removes Sarah after confirming, and her signed-in browser shows the no-access page', async ({
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
      await page.getByRole('button', { name: copy.team.remove }).click();
      const dialog = page.getByRole('alertdialog');
      await expect(
        dialog.getByRole('heading', {
          name: copy.team.removeDialog.title.replace('{name}', 'Sarah'),
        }),
      ).toBeVisible();
      await expect(
        dialog.getByText(
          copy.team.removeDialog.body.replaceAll('{name}', 'Sarah').replace('{workspace}', GYM),
        ),
      ).toBeVisible();
      await expectNoAxeViolations(page, `the remove dialog in ${appLocale}`);

      // Cancelling removes nobody.
      await dialog.getByRole('button', { name: copy.team.removeDialog.cancel }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole('row')).toHaveCount(3);

      await page.getByRole('button', { name: copy.team.remove }).click();
      await dialog.getByRole('button', { name: copy.team.removeDialog.confirm }).click();

      await expect(page.getByRole('status')).toHaveText(
        copy.team.removed.replace('{name}', 'Sarah'),
      );
      await expect(page.getByRole('row')).toHaveCount(2);
      await expect(page.getByText(sarah)).toHaveCount(0);
      // The title streams in after the body of the refresh (#353, #354), and axe wants one.
      await expect(page).toHaveTitle(copy.team.title);
      await expectNoAxeViolations(page, `TW-06 after a removal in ${appLocale}`);

      // The data path: the API holds only John.
      const listed = (await (
        await page.request.get(
          `/api/v1/workspaces/${(await (await page.request.get('/api/v1/me/workspaces')).json())[0].workspaceId}/team-members`,
        )
      ).json()) as { name: string }[];
      expect(listed.map(({ name }) => name)).toEqual(['John']);

      // No sign-out needed: Sarah's session still works (she is not sent to sign in), so her
      // account is kept, and her next page is the no-access page.
      await sarahsPage.goto(`/w/${slug}`);
      await expect(
        sarahsPage.getByRole('heading', { level: 1, name: copy.noAccess.title }),
      ).toBeVisible();
      await expectNoAxeViolations(
        sarahsPage,
        `the no-access page of a removed Trainer in ${appLocale}`,
      );
    } finally {
      await sarahsBrowser.close();
    }
  });
});

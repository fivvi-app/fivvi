import {
  clientIpHeaders,
  createAccount,
  createGymWithTrainer,
  newAddress,
  signInWithSession,
} from './accounts';
import { expect, expectNoAxeViolations, test } from './fixtures';

// F003 (spec #171): My profile (TW-09) and the role in the sidebar header. Copy comes from the
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
});

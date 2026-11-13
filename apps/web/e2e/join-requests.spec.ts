import type { Page } from '@playwright/test';
import {
  clientIpHeaders,
  createAccount,
  createGymWithTrainer,
  joinCodeOf,
  joinTeam,
  newAddress,
  signInWithSession,
} from './accounts';
import { expect, expectNoAxeViolations, test } from './fixtures';

// F029 (spec #484): the Aanmeldlink page, the join-link half of AC6 and AC7 (the requests, the
// public join page and the emails come with the other tickets). Copy comes from the catalogs.
// Each spec has accounts and workspaces of its own: John is the Owner and Sarah a Trainer of John's Gym.
const GYM = "John's Gym";

test.describe('F029 the Aanmeldlink page', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
  });

  /** John (Owner) and Sarah (Trainer) of John's Gym. */
  async function team() {
    const john = newAddress('john');
    const sarah = newAddress('sarah');
    await createAccount(john, undefined, 'John');
    await createAccount(sarah, undefined, 'Sarah');
    const slug = await createGymWithTrainer(john, GYM, 'owner');
    await joinTeam(sarah, slug, 'trainer');
    return { john, sarah, slug };
  }

  test('AC6: renew the join link', async ({ page, context, appLocale, messages: copy }) => {
    const { john, slug } = await team();
    const before = await joinCodeOf(slug);
    await signInWithSession(context, john);

    await page.goto(`/w/${slug}`);
    await page
      .getByRole('navigation', { name: copy.workspaceNav.label })
      .getByRole('link', { name: copy.workspaceNav.joinLink })
      .click();

    await expect(page).toHaveURL(`/w/${slug}/join-link`);
    await expect(page).toHaveTitle(copy.joinLink.title);
    await expect(page.getByRole('heading', { level: 1, name: copy.joinLink.title })).toBeVisible();
    await expect(page.getByText(copy.joinLink.body)).toBeVisible();
    // The data path: the page shows the link the API holds, built on the code in the row.
    const joinLink = page.getByTestId('join-link-url');
    await expect(joinLink).toHaveText(new RegExp(`/j/${before}$`));
    const read = (await (
      await page.request.get(`/api/v1/workspaces/${await workspaceId(page, slug)}/join-link`)
    ).json()) as { url: string };
    await expect(joinLink).toHaveText(read.url);
    await expectNoAxeViolations(page, `the Aanmeldlink page of John in ${appLocale}`);

    await page.getByRole('button', { name: copy.joinLink.renew }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(
      dialog.getByRole('heading', { name: copy.joinLink.renewDialog.title }),
    ).toBeVisible();
    await expect(dialog.getByText(copy.joinLink.renewDialog.body)).toBeVisible();
    // A destructive confirm uses the error colour (information-architecture.md, destructive
    // confirmation): the link and its QR codes stop working.
    await expect(
      dialog.getByRole('button', { name: copy.joinLink.renewDialog.confirm }),
    ).toHaveClass(/text-destructive/);
    await expectNoAxeViolations(page, `the renew dialog in ${appLocale}`);

    // Terug changes nothing.
    await dialog.getByRole('button', { name: copy.joinLink.renewDialog.cancel }).click();
    await expect(dialog).toHaveCount(0);
    await expect(joinLink).toHaveText(read.url);
    await expect(page.getByRole('status')).toHaveCount(0);
    expect(await joinCodeOf(slug)).toBe(before);

    await page.getByRole('button', { name: copy.joinLink.renew }).click();
    await dialog.getByRole('button', { name: copy.joinLink.renewDialog.confirm }).click();

    await expect(page.getByRole('status')).toHaveText(copy.joinLink.renewed);
    const after = await joinCodeOf(slug);
    expect(after).not.toBe(before);
    await expect(joinLink).toHaveText(new RegExp(`/j/${after}$`));
    // The page asks the server again, and a reload shows the same.
    await expect(page).toHaveTitle(copy.joinLink.title);
    await expectNoAxeViolations(page, `the Aanmeldlink page after a renewal in ${appLocale}`);
    await page.reload();
    await expect(joinLink).toHaveText(new RegExp(`/j/${after}$`));
  });

  test('@permission AC7: no requests tab for a Trainer', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const { sarah, slug } = await team();
    const code = await joinCodeOf(slug);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await signInWithSession(context, sarah);

    await page.goto(`/w/${slug}`);
    await page
      .getByRole('navigation', { name: copy.workspaceNav.label })
      .getByRole('link', { name: copy.workspaceNav.joinLink })
      .click();

    await expect(page).toHaveURL(`/w/${slug}/join-link`);
    const joinLink = page.getByTestId('join-link-url');
    await expect(joinLink).toHaveText(new RegExp(`/j/${code}$`));
    // She copies the link, and has no Vernieuwen.
    await page.getByRole('button', { name: copy.joinLink.copy }).click();
    await expect(page.getByRole('status')).toHaveText(copy.joinLink.copied);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      (await joinLink.textContent()) ?? '',
    );
    await expect(page.getByRole('button', { name: copy.joinLink.renew })).toHaveCount(0);
    await expectNoAxeViolations(page, `the Aanmeldlink page of Sarah in ${appLocale}`);

    // The API says the same: she may read the link, not renew it.
    const id = await workspaceId(page, slug);
    expect((await page.request.get(`/api/v1/workspaces/${id}/join-link`)).status()).toBe(200);
    expect((await page.request.post(`/api/v1/workspaces/${id}/join-link/renew`)).status()).toBe(
      403,
    );
    expect(await joinCodeOf(slug)).toBe(code);
  });
});

/** The ID of the workspace with the URL name `slug`, as `GET /v1/me/workspaces` lists it. */
async function workspaceId(page: Page, slug: string): Promise<string> {
  const listed = (await (await page.request.get('/api/v1/me/workspaces')).json()) as {
    workspaceId: string;
    slug: string;
  }[];
  const found = listed.find((workspace) => workspace.slug === slug);
  if (!found) throw new Error(`No workspace ${slug} in /v1/me/workspaces.`);
  return found.workspaceId;
}

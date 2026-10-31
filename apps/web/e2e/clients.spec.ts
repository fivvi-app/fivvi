import type { Messages } from '@fivvi/i18n';
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

// F006 (spec #174): TW-01 Klanten (list, search, quick add) and the plain profile a quick add
// opens. Copy comes from the catalogs. Each spec has accounts and workspaces of its own (see
// language.spec.ts): John owns John's Gym, Sarah is a Trainer there, Mike owns Fit Studio. The
// clients are synthetic: Anna de Vries (anna@example.com) and Mark Jansen (no email address).
const GYM = "John's Gym";

interface ClientBody {
  id: string;
  name: string;
  email: string | null;
  emailLocale: string | null;
}

test.describe('F006 clients on the web', () => {
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

  /** The workspace ID of John's Gym for the signed-in page. */
  async function gymId(page: Page): Promise<string> {
    const workspaces = (await (await page.request.get('/api/v1/me/workspaces')).json()) as {
      workspaceId: string;
      name: string;
    }[];
    const id = workspaces.find((workspace) => workspace.name === GYM)?.workspaceId;
    if (!id) throw new Error(`No workspace ${GYM}.`);
    return id;
  }

  /** Adds a client through the API, as the data a spec starts from. */
  async function seed(page: Page, workspaceId: string, data: Record<string, string>) {
    const response = await page.request.post(`/api/v1/workspaces/${workspaceId}/clients`, { data });
    expect(response.status()).toBe(201);
    return (await response.json()) as ClientBody;
  }

  /** The clients of the workspace as the API holds them. */
  async function stored(page: Page, workspaceId: string): Promise<ClientBody[]> {
    const response = await page.request.get(`/api/v1/workspaces/${workspaceId}/clients`);
    return ((await response.json()) as { items: ClientBody[] }).items;
  }

  const defaultLanguage = (copy: Messages, language: 'nl' | 'en') =>
    copy.clients.addDialog.localeDefault.replace(
      '{language}',
      copy.clients.languageNames[language],
    );

  for (const person of ['owner', 'trainer'] as const) {
    test(`AC1: ${person === 'owner' ? 'John' : 'Sarah'} adds Mark Jansen with a name only and the profile opens with the default language`, async ({
      page,
      context,
      appLocale,
      messages: copy,
    }) => {
      const { john, sarah, slug } = await team();
      await signInWithSession(context, person === 'owner' ? john : sarah);

      await page.goto(`/w/${slug}`);
      await page
        .getByRole('navigation', { name: copy.workspaceNav.label })
        .getByRole('link', { name: copy.workspaceNav.clients })
        .click();
      await expect(page).toHaveURL(`/w/${slug}/clients`);
      await expect(page).toHaveTitle(copy.clients.title);
      await expect(page.getByText(copy.clients.empty)).toBeVisible();
      await expectNoAxeViolations(page, `TW-01 empty in ${appLocale}`);

      // The list's own button and the top bar's + Nieuw → Klant open the same dialog.
      if (person === 'owner') {
        await page.getByRole('button', { name: copy.clients.add }).first().click();
      } else {
        await page.getByRole('button', { name: copy.workspaceNav.new, exact: true }).click();
        await page.getByRole('button', { name: copy.workspaceNav.newClient, exact: true }).click();
      }
      const dialog = page.getByRole('dialog', { name: copy.clients.addDialog.title });
      await expect(dialog).toBeVisible();
      const name = dialog.getByLabel(copy.clients.addDialog.nameLabel);
      await expect(name).toBeFocused();
      await expect(dialog.getByLabel(copy.clients.addDialog.emailLabel)).toBeVisible();
      // The workspace's default language is named and preselected.
      const language = dialog.getByLabel(copy.clients.addDialog.localeLabel);
      await expect(language).toHaveValue('');
      await expect(language.locator('option:checked')).toHaveText(defaultLanguage(copy, 'nl'));
      await expect(language.locator('option')).toHaveText([
        defaultLanguage(copy, 'nl'),
        copy.clients.addDialog.localeNl,
        copy.clients.addDialog.localeEn,
      ]);
      await expectNoAxeViolations(page, `the quick-add dialog in ${appLocale}`);

      await name.fill('Mark Jansen');
      await dialog.getByRole('button', { name: copy.clients.addDialog.submit }).click();

      await expect(page).toHaveURL(new RegExp(`/w/${slug}/clients/[0-9a-f-]{36}\\?added=1$`));
      await expect(page.getByRole('heading', { level: 1, name: 'Mark Jansen' })).toBeVisible();
      await expect(page.getByRole('status')).toHaveText(
        copy.clients.profile.added.replace('{name}', 'Mark Jansen'),
      );
      await expect(page.getByText(defaultLanguage(copy, 'nl'))).toBeVisible();
      await expect(page.getByText(copy.clients.profile.noEmail)).toBeVisible();
      await expect(page).toHaveTitle(copy.clients.profile.title);
      await expectNoAxeViolations(page, `TW-02 in ${appLocale}`);

      // The data path: the API holds Mark in John's Gym, with no email address and no language.
      const clients = await stored(page, await gymId(page));
      expect(clients).toEqual([
        { id: expect.any(String), name: 'Mark Jansen', email: null, emailLocale: null },
      ]);
      expect(page.url()).toContain(`/clients/${clients[0]?.id}`);

      // The list shows him.
      await page.getByRole('main').getByRole('link', { name: copy.clients.title }).click();
      await expect(page.getByRole('link', { name: 'Mark Jansen' })).toBeVisible();
    });
  }

  test('AC2: field messages for an empty or too long name and an invalid email, keeping the input, and nothing is saved', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const { john, slug } = await team();
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}/clients`);
    const workspaceId = await gymId(page);

    await page.getByRole('button', { name: copy.clients.add }).first().click();
    const dialog = page.getByRole('dialog', { name: copy.clients.addDialog.title });
    const name = dialog.getByLabel(copy.clients.addDialog.nameLabel);
    const email = dialog.getByLabel(copy.clients.addDialog.emailLabel);
    const submit = dialog.getByRole('button', { name: copy.clients.addDialog.submit });

    // An empty name, and a blank one. (The pointer leaves the button before axe looks: its hover
    // colour is not the state under test.)
    await submit.click();
    await page.mouse.move(0, 0);
    await expect(dialog.getByText(copy.clients.addDialog.errors.nameRequired)).toBeVisible();
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expectNoAxeViolations(page, `the quick-add dialog with a name message in ${appLocale}`);
    await name.fill('   ');
    await submit.click();
    await expect(dialog.getByText(copy.clients.addDialog.errors.nameRequired)).toBeVisible();

    // A name of 121 characters, and an address that is none; the input stays as typed.
    const tooLong = 'x'.repeat(121);
    await name.fill(tooLong);
    await email.fill('not-an-address');
    await submit.click();
    await expect(dialog.getByText(copy.clients.addDialog.errors.nameTooLong)).toBeVisible();
    await expect(dialog.getByText(copy.clients.addDialog.errors.emailInvalid)).toBeVisible();
    await expect(name).toHaveValue(tooLong);
    await expect(email).toHaveValue('not-an-address');
    await expect(email).toHaveAttribute('aria-invalid', 'true');
    await expectNoAxeViolations(page, `the quick-add dialog with field messages in ${appLocale}`);
    expect(await stored(page, workspaceId)).toEqual([]);

    // Anna, with a mixed-case address and English: stored lower case, with the language chosen.
    await name.fill('Anna de Vries');
    await email.fill('Anna@Example.com');
    await dialog.getByLabel(copy.clients.addDialog.localeLabel).selectOption('en');
    await submit.click();
    await expect(page).toHaveURL(new RegExp(`/w/${slug}/clients/[0-9a-f-]{36}\\?added=1$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Anna de Vries' })).toBeVisible();
    await expect(page.getByText('anna@example.com')).toBeVisible();
    await expect(page.getByText(copy.clients.addDialog.localeEn, { exact: true })).toBeVisible();
    // The title streams in after the page (#353, #354), and the end-of-test axe check wants one.
    await expect(page).toHaveTitle(copy.clients.profile.title);
    expect(await stored(page, workspaceId)).toEqual([
      {
        id: expect.any(String),
        name: 'Anna de Vries',
        email: 'anna@example.com',
        emailLocale: 'en',
      },
    ]);
  });

  test('AC3: a duplicate email offers to open the existing client, or another address, and creates nothing', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const { sarah, slug } = await team();
    await signInWithSession(context, sarah);
    await page.goto(`/w/${slug}/clients`);
    const workspaceId = await gymId(page);
    const anna = await seed(page, workspaceId, {
      name: 'Anna de Vries',
      email: 'anna@example.com',
    });

    await page.reload();
    await page.getByRole('button', { name: copy.clients.add }).first().click();
    const dialog = page.getByRole('dialog', { name: copy.clients.addDialog.title });
    const email = dialog.getByLabel(copy.clients.addDialog.emailLabel);
    await dialog.getByLabel(copy.clients.addDialog.nameLabel).fill('Anna');
    await email.fill('ANNA@example.com');
    await dialog.getByRole('button', { name: copy.clients.addDialog.submit }).click();

    const exists = copy.clients.addDialog.exists.replace('{name}', 'Anna de Vries');
    await page.mouse.move(0, 0);
    await expect(dialog.getByText(exists)).toBeVisible();
    await expect(email).toHaveAttribute('aria-invalid', 'true');
    await expectNoAxeViolations(page, `the quick-add dialog with a duplicate in ${appLocale}`);
    expect(await stored(page, workspaceId)).toHaveLength(1);

    // Another address: the message goes, the address is selected for typing, the name stays.
    await dialog.getByRole('button', { name: copy.clients.addDialog.otherEmail }).click();
    await expect(dialog.getByText(exists)).toHaveCount(0);
    await expect(email).toBeFocused();
    await expect(dialog.getByLabel(copy.clients.addDialog.nameLabel)).toHaveValue('Anna');

    // Open the existing client: Anna's profile, and still one client.
    await email.fill('anna@example.com');
    await dialog.getByRole('button', { name: copy.clients.addDialog.submit }).click();
    await dialog
      .getByRole('button', {
        name: copy.clients.addDialog.openExisting.replace('{name}', 'Anna de Vries'),
      })
      .click();
    await expect(page).toHaveURL(`/w/${slug}/clients/${anna.id}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Anna de Vries' })).toBeVisible();
    await expect(page.getByText('anna@example.com')).toBeVisible();
    await expect(page.getByRole('status')).toHaveCount(0);
    await expect(page).toHaveTitle(copy.clients.profile.title);
    expect(await stored(page, workspaceId)).toHaveLength(1);
  });

  for (const person of ['owner', 'trainer'] as const) {
    test(`AC6: ${person === 'owner' ? 'John' : 'Sarah'} sees the whole list and "vrie" finds Anna de Vries`, async ({
      page,
      context,
      appLocale,
      messages: copy,
    }) => {
      const { john, sarah, mike, slug } = await team();
      await signInWithSession(context, person === 'owner' ? john : sarah);
      await page.goto(`/w/${slug}`);
      const workspaceId = await gymId(page);
      await seed(page, workspaceId, { name: 'Mark Jansen' });
      await seed(page, workspaceId, { name: 'Anna de Vries', email: 'anna@example.com' });
      await seed(page, workspaceId, { name: 'Bram Visser', email: 'bram@example.com' });

      await page.goto(`/w/${slug}/clients`);
      const list = page.getByRole('list', { name: copy.clients.listLabel });
      // Sorted by name; a client with an email address shows it, one without shows the name alone.
      await expect(list.getByRole('listitem')).toHaveText([
        'Anna de Vriesanna@example.com',
        'Bram Visserbram@example.com',
        'Mark Jansen',
      ]);
      await expectNoAxeViolations(page, `TW-01 in ${appLocale}`);

      // Part of a name finds Anna, as you type.
      const search = page.getByRole('searchbox', { name: copy.clients.searchPlaceholder });
      await expect(search).toHaveAttribute('placeholder', copy.clients.searchPlaceholder);
      await search.pressSequentially('VRIE');
      await expect(list.getByRole('listitem')).toHaveText(['Anna de Vriesanna@example.com']);
      // Part of an email address finds Bram.
      await search.fill('bram@');
      await expect(list.getByRole('listitem')).toHaveText(['Bram Visserbram@example.com']);
      await search.fill('zzz');
      await expect(page.getByText(copy.clients.noResults)).toBeVisible();
      await expectNoAxeViolations(page, `TW-01 without a match in ${appLocale}`);
      await search.fill('');
      await expect(list.getByRole('listitem')).toHaveCount(3);

      // Anna opens her profile.
      await search.fill('vrie');
      await list.getByRole('link', { name: /Anna de Vries/ }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Anna de Vries' })).toBeVisible();
      await expect(page).toHaveTitle(copy.clients.profile.title);
      await expect(page.getByText(defaultLanguage(copy, 'nl'))).toBeVisible();

      // Another workspace's team sees none of them.
      await signInWithSession(context, mike);
      const denied = await page.request.get(`/api/v1/workspaces/${workspaceId}/clients`);
      expect(denied.status()).toBe(404);
    });
  }

  test('a client that is not in the workspace is a 404, and an English workspace default is named in the form', async ({
    page,
    context,
    messages: copy,
  }) => {
    const { john, slug } = await team();
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}`);
    const workspaceId = await gymId(page);
    const response = await page.goto(`/w/${slug}/clients/00000000-0000-4000-8000-000000000000`);
    expect(response?.status()).toBe(404);

    // The workspace default is English: the options name it so.
    const set = await page.request.patch(`/api/v1/workspaces/${workspaceId}`, {
      data: { defaultLocale: 'en' },
    });
    expect(set.status()).toBe(200);
    await page.goto(`/w/${slug}/clients`);
    await page.getByRole('button', { name: copy.clients.add }).first().click();
    const language = page
      .getByRole('dialog', { name: copy.clients.addDialog.title })
      .getByLabel(copy.clients.addDialog.localeLabel);
    await expect(language.locator('option:checked')).toHaveText(defaultLanguage(copy, 'en'));
  });
});

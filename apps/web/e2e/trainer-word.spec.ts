import { TRAINER_WORDS, trainerWordForms } from '@fivvi/i18n';
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

// F068 (spec #588): the workspace's word for its trainers on the trainer web. TW-08 Settings →
// General → Woordkeuze, where the Owner chooses it (AC1, AC10, AC11), and the screens that say it
// (AC1, AC3, AC4, AC11). Copy comes from the catalogs. Each spec has accounts and workspaces of its
// own (see language.spec.ts). John owns John's Gym, Sarah is a Trainer there.
const GYM = "John's Gym";

interface Workspace {
  id: string;
  name: string;
  slug: string;
  defaultLocale: string;
  timeZone: string;
  trainerWord: string;
}

/** The ID of the workspace `name` of the signed-in person, from the API. */
async function workspaceIdOf(page: Page, name: string): Promise<string> {
  const workspaces = (await (await page.request.get('/api/v1/me/workspaces')).json()) as {
    workspaceId: string;
    name: string;
  }[];
  const workspaceId = workspaces.find((workspace) => workspace.name === name)?.workspaceId;
  if (!workspaceId) throw new Error(`No workspace ${name}.`);
  return workspaceId;
}

/** The workspace as the API holds it. */
async function workspaceOf(page: Page, workspaceId: string): Promise<Workspace> {
  return (await (await page.request.get(`/api/v1/workspaces/${workspaceId}`)).json()) as Workspace;
}

test.describe('F068 the workspace’s word', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
  });

  /** John (Owner) and Sarah (Trainer) of John's Gym. */
  async function gym() {
    const john = newAddress('john');
    const sarah = newAddress('sarah');
    await createAccount(john, undefined, 'John');
    await createAccount(sarah, undefined, 'Sarah');
    const slug = await createGymWithTrainer(john, GYM, 'owner');
    await joinTeam(sarah, slug, 'trainer');
    return { john, sarah, slug };
  }

  test('AC1: John chooses instructeur on Woordkeuze; it is saved for John’s Gym and the card shows it chosen after a reload', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const { john, slug } = await gym();
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}/settings/general`);

    const card = page
      .locator('[data-slot="card"]')
      .filter({ has: page.getByRole('heading', { level: 2, name: copy.settingsWording.title }) });
    await expect(card).toBeVisible();
    // The text names the workspace.
    await expect(
      card.getByText(copy.settingsWording.help.replace('{workspace}', GYM)),
    ).toBeVisible();
    // Four choices, each with its singular and plural in the reader's language; a new workspace starts on trainer.
    await expect(card.getByRole('radio')).toHaveCount(4);
    for (const choice of TRAINER_WORDS) {
      const { Word, words } = trainerWordForms(choice, appLocale);
      const radio = card.getByRole('radio', { name: `${Word} ${words}` });
      await expect(radio).toBeAttached();
      if (choice === 'trainer') await expect(radio).toBeChecked();
      else await expect(radio).not.toBeChecked();
    }
    await expectNoAxeViolations(page, `Woordkeuze in ${appLocale}`);

    const workspaceId = await workspaceIdOf(page, GYM);
    expect((await workspaceOf(page, workspaceId)).trainerWord).toBe('trainer');

    const instructeur = trainerWordForms('instructeur', appLocale);
    await card.getByText(instructeur.Word, { exact: true }).click();
    await expect(card.getByText(copy.settingsWording.saved)).toBeVisible();
    await expect(
      card.getByRole('radio', { name: `${instructeur.Word} ${instructeur.words}` }),
    ).toBeChecked();
    await expectNoAxeViolations(page, `Woordkeuze after a choice in ${appLocale}`);

    // The data path: the API holds it for John's Gym, and the card shows it after a reload.
    expect((await workspaceOf(page, workspaceId)).trainerWord).toBe('instructeur');
    await page.reload();
    await expect(
      page.getByRole('radio', { name: `${instructeur.Word} ${instructeur.words}` }),
    ).toBeChecked();
    await expect(page.getByRole('radio', { checked: true })).toHaveCount(1);
  });

  test('AC11: John changes the word again; the new choice is saved and nothing else in Algemeen changes', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const { john, slug } = await gym();
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}/settings/general`);
    const workspaceId = await workspaceIdOf(page, GYM);
    const before = await workspaceOf(page, workspaceId);
    const choose = async (choice: (typeof TRAINER_WORDS)[number]) => {
      const { Word, words } = trainerWordForms(choice, appLocale);
      await page.getByText(Word, { exact: true }).click();
      await expect(page.getByRole('radio', { name: `${Word} ${words}` })).toBeChecked();
      await expect(page.getByText(copy.settingsWording.saved)).toBeVisible();
    };

    await choose('instructeur');
    expect((await workspaceOf(page, workspaceId)).trainerWord).toBe('instructeur');
    await choose('docent');
    await choose('coach');

    // The name field of the same page keeps what was typed and unsaved; the workspace keeps its name, URL name, language and time zone.
    await expect(page.getByLabel(copy.settingsGeneral.nameLabel)).toHaveValue(GYM);
    const after = await workspaceOf(page, workspaceId);
    expect(after).toEqual({ ...before, trainerWord: 'coach' });
    await page.reload();
    await expect(page.getByRole('radio', { checked: true })).toHaveAccessibleName(
      `${trainerWordForms('coach', appLocale).Word} ${trainerWordForms('coach', appLocale).words}`,
    );
    await expect(page.getByLabel(copy.settingsGeneral.nameLabel)).toHaveValue(GYM);
    await expectNoAxeViolations(page, `Woordkeuze after another choice in ${appLocale}`);
  });

  test('@permission AC10: Sarah (Trainer) can’t change the word: Woordkeuze isn’t editable for her, and the route answers 403', async ({
    page,
    context,
    browser,
    baseURL,
    appLocale,
    messages: copy,
  }) => {
    const { john, sarah, slug } = await gym();
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}/settings/general`);
    const workspaceId = await workspaceIdOf(page, GYM);
    await page.getByText(trainerWordForms('docent', appLocale).Word, { exact: true }).click();
    await expect(page.getByText(copy.settingsWording.saved)).toBeVisible();

    const sarahsBrowser = await browser.newContext({
      baseURL,
      extraHTTPHeaders: clientIpHeaders(),
    });
    try {
      await signInWithSession(sarahsBrowser, sarah);
      const sarahsPage = await sarahsBrowser.newPage();
      // She has no Settings in her navigation; its URL shows the no-permission page and no choice.
      await sarahsPage.goto(`/w/${slug}`);
      await expect(
        sarahsPage
          .getByRole('navigation', { name: copy.workspaceNav.label })
          .getByRole('link', { name: copy.workspaceNav.settings, exact: true }),
      ).toHaveCount(0);
      await sarahsPage.goto(`/w/${slug}/settings/general`);
      await expect(
        sarahsPage.getByRole('heading', { level: 1, name: copy.noPermission.title }),
      ).toBeVisible();
      await expect(sarahsPage.getByRole('radio')).toHaveCount(0);
      await expectNoAxeViolations(sarahsPage, `Sarah on the General URL in ${appLocale}`);

      // The API lets her read the word and refuses to change it.
      expect((await workspaceOf(sarahsPage, workspaceId)).trainerWord).toBe('docent');
      const refused = await sarahsPage.request.patch(`/api/v1/workspaces/${workspaceId}`, {
        data: { trainerWord: 'coach' },
      });
      expect(refused.status()).toBe(403);
      expect((await workspaceOf(page, workspaceId)).trainerWord).toBe('docent');
    } finally {
      await sarahsBrowser.close();
    }
  });
});
